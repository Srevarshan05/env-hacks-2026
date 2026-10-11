import threading
import uuid

import pytest

from app import worker
from app.db import get_sessionmaker
from app.models import RefillSession
from app.services.refills import InvalidTransition, advance_session, verify_and_settle
from tests.conftest import sql


def start(client, user, machine="NODE-001", **headers):
    return client.post("/api/refill-sessions", json={"machine_id": machine}, headers={**user["headers"], **headers})


def status(client, user, sid):
    r = client.get(f"/api/refill-sessions/{sid}", headers=user["headers"])
    assert r.status_code == 200, r.text
    return r.json()


def test_full_simulated_refill_credits_exactly_once(client, clock, make_user):
    user = make_user(machine_id="node-001")
    assert user["machine"]["status"] == "ok" and user["machine"]["machine_id"] == "NODE-001"

    r = start(client, user)
    assert r.status_code == 201
    sid = r.json()["session_id"]
    assert r.json()["status"] == "created" and r.json()["is_simulated"] is True

    assert status(client, user, sid)["status"] == "active"          # simulated machine ack
    clock.advance(2)                                                 # start delay elapses
    s = status(client, user, sid)
    assert (s["status"], s["measured_liters"]) == ("measuring", 0.0)
    clock.advance(3)
    assert status(client, user, sid)["measured_liters"] == 0.75

    # Polling many times at the same instant must not create water.
    for _ in range(10):
        assert status(client, user, sid)["measured_liters"] == 0.75

    clock.advance(2)
    s = status(client, user, sid)
    assert s["status"] == "approved"
    assert s["verified_liters"] == 1.25 and s["points_awarded"] == 1
    assert s["verification_mode"] == "simulator"

    # More polls / worker passes after approval change nothing.
    for _ in range(3):
        status(client, user, sid)
        worker.run_once(clock.advance(5))

    pts = client.get("/api/me/points", headers=user["headers"]).json()
    assert pts["balance"] == 1 and len(pts["ledger"]) == 1
    assert pts["ledger"][0]["reason"].endswith("[SIMULATED]")
    assert sql("SELECT liters, status, points_awarded FROM contributions") == [(pytest.approx(1.25), "approved", 1)]
    assert sql("SELECT count(*) FROM flow_readings WHERE session_id = %s", uuid.UUID(sid)) == [(6,)]

    readings = client.get(f"/api/refill-sessions/{sid}?include_readings=true", headers=user["headers"]).json()["readings"]
    assert [r["cumulative_liters"] for r in readings] == [0, 0.25, 0.5, 0.75, 1.0, 1.25]


def test_settling_an_approved_session_again_is_impossible(client, clock, make_user):
    user = make_user()
    sid = uuid.UUID(start(client, user).json()["session_id"])
    worker.run_once(clock.advance(30))
    with get_sessionmaker()() as db:
        s = db.get(RefillSession, sid)
        assert s.status == "approved"
        with pytest.raises(InvalidTransition):
            verify_and_settle(db, s, clock.now)
    assert sql("SELECT count(*) FROM points_ledger") == [(1,)]


def test_worker_recovers_session_after_downtime(client, clock, make_user):
    """Nobody polls and no worker runs for 10 minutes; the next pass completes it identically."""
    user = make_user()
    sid = start(client, user).json()["session_id"]
    assert worker.run_once(clock.advance(600)) == 1
    s = status(client, user, sid)
    assert (s["status"], s["verified_liters"], s["points_awarded"]) == ("approved", 1.25, 1)


def test_partial_progress_then_resume(client, clock, make_user):
    user = make_user()
    sid = start(client, user).json()["session_id"]
    worker.run_once(clock.advance(4))   # measuring, 0.50 L
    assert status(client, user, sid)["measured_liters"] == 0.5
    worker.run_once(clock.advance(100))
    assert status(client, user, sid)["points_awarded"] == 1


def test_client_cannot_supply_liters(client, clock, make_user):
    user = make_user()
    r = client.post("/api/refill-sessions", json={"machine_id": "NODE-001", "liters": 50}, headers=user["headers"])
    assert r.status_code == 422


def test_double_tap_returns_same_session(client, clock, make_user):
    user = make_user()
    a, b = start(client, user), start(client, user)
    assert (a.status_code, b.status_code) == (201, 200)
    assert a.json()["session_id"] == b.json()["session_id"]


def test_idempotency_key_replays_even_after_completion(client, clock, make_user):
    user = make_user()
    a = start(client, user, **{"Idempotency-Key": "tap-1"})
    worker.run_once(clock.advance(30))
    b = start(client, user, **{"Idempotency-Key": "tap-1"})
    assert b.status_code == 200 and b.json()["session_id"] == a.json()["session_id"]
    assert b.json()["status"] == "approved"
    assert sql("SELECT count(*) FROM refill_sessions") == [(1,)]


def test_machine_busy_and_one_session_per_user(client, clock, make_user):
    alice, bob = make_user(), make_user()
    assert start(client, alice).status_code == 201
    r = start(client, bob)
    assert r.status_code == 409 and r.json()["error"] == "machine_busy"
    r = start(client, alice, machine="NODE-002")
    assert r.status_code == 409 and r.json()["error"] == "user_has_open_session"
    assert client.get("/api/machines/NODE-001").json()["available"] is False


def test_concurrent_starts_on_one_machine_have_one_winner(client, clock, make_user):
    users = [make_user() for _ in range(6)]
    results = []
    barrier = threading.Barrier(len(users))

    def go(u):
        barrier.wait()
        results.append(start(client, u).status_code)

    threads = [threading.Thread(target=go, args=(u,)) for u in users]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [201] + [409] * 5
    assert sql("SELECT count(*) FROM refill_sessions") == [(1,)]


def test_concurrent_advances_credit_once(client, clock, make_user):
    user = make_user()
    sid = uuid.UUID(start(client, user).json()["session_id"])
    clock.advance(30)
    barrier = threading.Barrier(8)

    def go():
        barrier.wait()
        with get_sessionmaker()() as db:
            advance_session(db, sid, clock.now, skip_locked=False)

    threads = [threading.Thread(target=go) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sql("SELECT count(*), sum(delta) FROM points_ledger") == [(1, 1)]


def test_users_cannot_see_or_cancel_each_others_sessions(client, clock, make_user):
    alice, mallory = make_user(), make_user()
    sid = start(client, alice).json()["session_id"]
    assert client.get(f"/api/refill-sessions/{sid}", headers=mallory["headers"]).status_code == 404
    assert client.post(f"/api/refill-sessions/{sid}/cancel", headers=mallory["headers"]).status_code == 404
    assert client.get(f"/api/refill-sessions/{sid}").status_code == 401


def test_cancel_before_flow_earns_nothing(client, clock, make_user):
    user = make_user()
    sid = start(client, user).json()["session_id"]
    r = client.post(f"/api/refill-sessions/{sid}/cancel", headers=user["headers"])
    assert r.json()["status"] == "cancelled"
    worker.run_once(clock.advance(60))
    assert status(client, user, sid)["status"] == "cancelled"
    assert sql("SELECT count(*) FROM points_ledger") == [(0,)]


def test_user_cannot_cancel_once_water_is_flowing(client, clock, make_user):
    user = make_user()
    sid = start(client, user).json()["session_id"]
    worker.run_once(clock.advance(3))
    assert client.post(f"/api/refill-sessions/{sid}/cancel", headers=user["headers"]).status_code == 409


def test_inactive_or_unknown_machine(client, clock, make_user):
    user = make_user(machine_id="NODE-999")
    assert user["machine"]["status"] == "not_found"
    sql("UPDATE nodes SET active = false WHERE id = 'NODE-002'")
    assert start(client, user, machine="NODE-002").json()["error"] == "machine_inactive"
    assert start(client, user, machine="NODE-999").status_code == 404
    assert start(client, user, machine="'; DROP TABLE users;--").status_code == 404


def test_abandoned_session_does_not_block_machine_without_worker(client, clock, make_user):
    """Serverless hosting has no always-on worker: a user who taps Hydrate and closes the page
    must not leave the machine busy. The next visitor's request completes the old session."""
    alice, bob = make_user(), make_user()
    sid = start(client, alice).json()["session_id"]       # Alice never polls again
    clock.advance(30)                                      # no worker pass happens
    assert client.get("/api/machines/NODE-001").json()["available"] is True
    r = start(client, bob)
    assert r.status_code == 201
    a = status(client, alice, sid)
    assert (a["status"], a["points_awarded"]) == ("approved", 1)   # Alice still got her point, once
    assert sql("SELECT count(*), sum(delta) FROM points_ledger") == [(1, 1)]
