import threading

from app import worker
from tests.conftest import sql


def earn(client, clock, user, refills=1):
    """Earn points through the real (simulated) refill pipeline: 1.25 L = 1 point per refill."""
    for _ in range(refills):
        client.post("/api/refill-sessions", json={"machine_id": "NODE-001"}, headers=user["headers"])
        worker.run_once(clock.advance(30))


def bamboo_bottle(cost: int = 3):
    """The seeded reward, re-priced so tests don't need 100 refills (reset in conftest.clean)."""
    rid = sql("SELECT id FROM rewards WHERE title = 'Reusable Bamboo Bottle'")[0][0]
    sql("UPDATE rewards SET points_cost = %s WHERE id = %s", cost, rid)
    return str(rid)


def test_redeem_flow_and_insufficient_points(client, clock, make_user):
    user = make_user()
    rid = bamboo_bottle()  # costs 3
    r = client.post(f"/api/rewards/{rid}/redeem", headers=user["headers"])
    assert r.status_code == 409 and r.json()["error"] == "insufficient_points"

    earn(client, clock, user, refills=4)  # 4 points
    r = client.post(f"/api/rewards/{rid}/redeem", headers={**user["headers"], "Idempotency-Key": "buy-1"})
    assert r.status_code == 201 and r.json()["balance"] == 1
    replay = client.post(f"/api/rewards/{rid}/redeem", headers={**user["headers"], "Idempotency-Key": "buy-1"})
    assert replay.status_code == 200 and replay.json()["replayed"] is True
    assert replay.json()["redemption_id"] == r.json()["redemption_id"]

    assert sql("SELECT stock FROM rewards WHERE id = %s", rid) == [(19,)]
    hist = client.get("/api/history", headers=user["headers"]).json()
    assert len(hist["redemptions"]) == 1 and len(hist["contributions"]) == 4
    pts = client.get("/api/me/points", headers=user["headers"]).json()
    assert (pts["earned"], pts["spent"], pts["balance"]) == (4, 3, 1)

    # The ledger doubles as an activity feed: newest first, with what caused each movement.
    debit, credit = pts["ledger"][0], pts["ledger"][1]
    assert (debit["type"], debit["delta"], debit["reward_title"], debit["liters"]) == (
        "redemption_debit", -3, "Reusable Bamboo Bottle", None)
    assert (credit["type"], credit["delta"], credit["liters"], credit["machine_id"], credit["machine_name"],
            credit["is_simulated"], credit["reward_title"]) == (
        "contribution_credit", 1, 1.25, "NODE-001", "Library Water Station", True, None)


def test_concurrent_redemptions_cannot_overspend(client, clock, make_user):
    user = make_user()
    earn(client, clock, user, refills=4)  # 4 points: enough for exactly one 3-point bottle
    rid = bamboo_bottle()
    codes = []
    barrier = threading.Barrier(5)

    def go(i):
        barrier.wait()
        codes.append(client.post(f"/api/rewards/{rid}/redeem",
                                 headers={**user["headers"], "Idempotency-Key": f"k{i}"}).status_code)

    threads = [threading.Thread(target=go, args=(i,)) for i in range(5)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(codes) == [201, 409, 409, 409, 409]
    assert client.get("/api/me/points", headers=user["headers"]).json()["balance"] == 1


def test_out_of_stock(client, clock, make_user):
    user = make_user()
    earn(client, clock, user, refills=4)
    rid = bamboo_bottle()
    sql("UPDATE rewards SET stock = 0 WHERE id = %s", rid)
    assert client.post(f"/api/rewards/{rid}/redeem", headers=user["headers"]).json()["error"] == "out_of_stock"


def test_dashboard_and_profile(client, clock, make_user):
    a, b = make_user(), make_user()
    earn(client, clock, a, refills=2)
    earn(client, clock, b, refills=1)
    d = client.get("/api/dashboard", headers=a["headers"]).json()
    assert d["stats"] == {"points": 2, "refills": 2, "liters": 2.5}
    assert len(d["weekly"]) == 7
    assert client.get("/api/profile", headers=a["headers"]).json()["rank"] == 1
    assert client.get("/api/profile", headers=b["headers"]).json()["rank"] == 2


def test_admin_permissions_and_qr(client, make_user):
    user, admin = make_user(), make_user(role="admin")
    assert client.get("/api/admin/machines/NODE-001/qr", headers=user["headers"]).status_code == 403
    r = client.get("/api/admin/machines/NODE-001/qr", headers=admin["headers"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("image/svg+xml")
    assert r.headers["x-qr-target"] == "http://localhost:5173/m/NODE-001"

    r = client.post("/api/admin/machines", headers=admin["headers"], json={"id": "NODE-010", "name": "Gym", "location": "Gym"})
    assert r.status_code == 201
    assert client.post("/api/admin/machines", headers=admin["headers"],
                       json={"id": "NODE-010", "name": "Gym", "location": "Gym"}).status_code == 409
    assert client.get("/api/machines/NODE-010").json()["available"] is True
    assert client.get("/api/admin/summary", headers=user["headers"]).status_code == 403


def test_health(client):
    body = client.get("/api/health").json()
    assert body["ok"] is True and body["verification_mode"] == "simulator" and body["simulated_refills"] is True
