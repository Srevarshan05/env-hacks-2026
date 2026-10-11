import uuid

from app import worker
from tests.conftest import DEVICE_HEADERS, sql

BASE = "/api/device/machines/NODE-001"


def start(client, user):
    r = client.post("/api/refill-sessions", json={"machine_id": "NODE-001"}, headers=user["headers"])
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def send(client, sid, seq, liters, final=False, headers=DEVICE_HEADERS):
    return client.post(f"{BASE}/sessions/{sid}/readings", headers=headers,
                       json={"seq": seq, "cumulative_liters": liters, "final": final})


def test_hardware_flow_is_never_simulated(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware")
    user = make_user()
    sid = start(client, user)

    # Without device input nothing happens, no matter how often the user polls.
    for _ in range(5):
        clock.advance(5)
        s = client.get(f"/api/refill-sessions/{sid}", headers=user["headers"]).json()
        assert (s["status"], s["measured_liters"], s["is_simulated"]) == ("created", 0.0, False)
    worker.run_once(clock.now)
    assert sql("SELECT count(*) FROM flow_readings") == [(0,)]

    pending = client.get(f"{BASE}/pending-session", headers=DEVICE_HEADERS).json()["session"]
    assert pending["session_id"] == sid and "user_id" not in pending
    assert client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS).json()["status"] == "active"

    for seq, liters in enumerate(["0", "0.30", "0.60", "0.90"]):
        clock.advance(1)
        assert send(client, sid, seq, liters).status_code == 200
    clock.advance(1)
    r = send(client, sid, 4, "1.05", final=True)
    assert r.json()["status"] == "approved"

    s = client.get(f"/api/refill-sessions/{sid}", headers=user["headers"]).json()
    assert (s["verified_liters"], s["points_awarded"], s["verification_mode"]) == (1.05, 1, "hardware")
    assert "[SIMULATED]" not in sql("SELECT reason FROM points_ledger")[0][0]


def test_device_auth_required(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware")
    sid = start(client, make_user())
    assert client.get(f"{BASE}/pending-session").status_code == 401
    assert client.post(f"{BASE}/sessions/{sid}/activate", headers={"X-Device-Key": "wrong"}).status_code == 401
    # A device for another machine cannot touch this session.
    assert client.post(f"/api/device/machines/NODE-002/sessions/{sid}/activate", headers=DEVICE_HEADERS).status_code == 404


def test_reading_validation(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware")
    sid = start(client, make_user())
    assert send(client, sid, 0, "0").status_code == 409  # not activated yet
    client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS)
    assert send(client, sid, 0, "0.5").status_code == 200
    assert send(client, sid, 0, "0.5").status_code == 200   # retry of the same reading: idempotent
    assert send(client, sid, 0, "0.7").status_code == 409   # same seq, different value
    assert send(client, sid, 1, "0.4").status_code == 422   # volume going backwards
    assert sql("SELECT count(*) FROM flow_readings") == [(1,)]


def test_idle_timeout_finishes_and_verifies(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware", flow_idle_timeout_s=8)
    user = make_user()
    sid = start(client, user)
    client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS)
    for seq in range(5):
        clock.advance(1)
        send(client, sid, seq, f"{seq * 0.5:.2f}")
    worker.run_once(clock.advance(5))
    assert sql("SELECT status FROM refill_sessions") == [("measuring",)]
    worker.run_once(clock.advance(5))
    assert sql("SELECT status, verified_liters, points_awarded FROM refill_sessions")[0][0::2] == ("approved", 2)


def test_implausible_flow_rate_fails(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware")
    sid = start(client, make_user())
    client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS)
    clock.advance(1)
    assert send(client, sid, 0, "15.0", final=True).json()["status"] == "failed"
    assert sql("SELECT failure_reason FROM refill_sessions") == [("implausible_flow_rate",)]
    assert sql("SELECT count(*) FROM points_ledger") == [(0,)]


def test_activation_and_flow_timeouts_expire(client, clock, make_user, mode):
    mode(refill_verification_mode="hardware")
    a = start(client, make_user())
    worker.run_once(clock.advance(61))
    assert sql("SELECT status, failure_reason FROM refill_sessions WHERE id = %s", uuid.UUID(a)) == [("expired", "machine_not_activated")]

    b = start(client, make_user())
    client.post(f"{BASE}/sessions/{b}/activate", headers=DEVICE_HEADERS)
    worker.run_once(clock.advance(121))
    assert sql("SELECT status, failure_reason FROM refill_sessions WHERE id = %s", uuid.UUID(b)) == [("expired", "no_flow_detected")]


def test_switching_to_hardware_never_approves_simulator_sessions(client, clock, make_user, mode):
    user = make_user()
    sid = start(client, user)            # created in simulator mode
    worker.run_once(clock.advance(3))    # measuring
    mode(refill_verification_mode="hardware")
    worker.run_once(clock.advance(60))
    s = client.get(f"/api/refill-sessions/{sid}", headers=user["headers"]).json()
    assert (s["status"], s["failure_reason"], s["points_awarded"]) == ("failed", "verification_mode_mismatch", 0)
    assert sql("SELECT count(*) FROM points_ledger") == [(0,)]


def test_device_endpoints_reject_simulator_sessions(client, clock, make_user):
    sid = start(client, make_user())
    assert client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS).status_code == 409
    assert send(client, sid, 0, "5").status_code == 409


def test_less_than_one_litre_earns_nothing(client, clock, make_user, mode):
    """At 1 point per litre, refills below MIN_VERIFIED_LITERS (1.00 L) fail instead of crediting 0 points."""
    mode(refill_verification_mode="hardware")
    sid = start(client, make_user())
    client.post(f"{BASE}/sessions/{sid}/activate", headers=DEVICE_HEADERS)
    for seq, liters in enumerate(["0", "0.40", "0.95"]):
        clock.advance(1)
        send(client, sid, seq, liters, final=liters == "0.95")
    assert sql("SELECT status, failure_reason FROM refill_sessions") == [("failed", "volume_below_minimum")]
    assert sql("SELECT count(*) FROM points_ledger") == [(0,)]
    assert sql("SELECT count(*) FROM contributions") == [(0,)]
