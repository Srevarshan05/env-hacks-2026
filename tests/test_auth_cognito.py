import uuid
from datetime import datetime, timedelta, timezone

from cryptography.hazmat.primitives.asymmetric import rsa

from tests.conftest import bearer, cognito_token, sql

SESSION = "/api/auth/session"


def test_first_login_creates_user_in_rds(client):
    sub = str(uuid.uuid4())
    token = cognito_token(sub=sub, email="Ann@Example.com", name="Ann Green")
    r = client.post(SESSION, json={"machine_id": "node-001"}, headers=bearer(token))
    assert r.status_code == 200
    body = r.json()
    assert body["is_new_user"] is True
    assert (body["user"]["email"], body["user"]["full_name"], body["user"]["role"]) == ("ann@example.com", "Ann Green", "user")
    assert body["machine"]["machine_id"] == "NODE-001" and body["machine"]["status"] == "ok"
    assert sql("SELECT cognito_sub, password_hash FROM users") == [(sub, "!cognito-managed")]

    # Returning user: same row, no duplicate; works without a body too.
    again = client.post(SESSION, headers=bearer(token)).json()
    assert again["is_new_user"] is False and again["user"]["id"] == body["user"]["id"] and again["machine"] is None
    assert client.get("/api/me", headers=bearer(token)).json()["user"]["id"] == body["user"]["id"]
    assert sql("SELECT count(*) FROM users") == [(1,)]


def test_any_endpoint_provisions_user(client):
    r = client.get("/api/me/points", headers=bearer(cognito_token()))
    assert r.status_code == 200 and r.json()["balance"] == 0
    assert sql("SELECT count(*) FROM users") == [(1,)]


def test_existing_rds_user_is_linked_by_verified_email(client):
    """Pre-Cognito accounts keep their history when they sign in with the same verified email."""
    sql("INSERT INTO users(full_name, email, password_hash) VALUES ('Old', 'old@example.com', '$2a$10$legacy')")
    sub = str(uuid.uuid4())
    body = client.post(SESSION, headers=bearer(cognito_token(sub=sub, email="old@example.com"))).json()
    assert body["is_new_user"] is False and body["user"]["full_name"] == "Old"
    assert sql("SELECT cognito_sub FROM users") == [(sub,)]


def test_unverified_email_cannot_take_over_existing_account(client):
    sql("INSERT INTO users(full_name, email, password_hash) VALUES ('Old', 'old@example.com', '$2a$10$legacy')")
    r = client.post(SESSION, headers=bearer(cognito_token(email="old@example.com", email_verified=False)))
    assert r.status_code == 409 and r.json()["error"] == "account_conflict"
    assert sql("SELECT cognito_sub FROM users") == [(None,)]


def test_email_owned_by_another_cognito_user_conflicts(client):
    client.post(SESSION, headers=bearer(cognito_token(email="same@example.com")))
    r = client.post(SESSION, headers=bearer(cognito_token(email="same@example.com")))
    assert r.status_code == 409


def test_invalid_tokens_are_rejected(client):
    past = datetime.now(timezone.utc) - timedelta(hours=2)
    bad = {
        "no token": None,
        "garbage": "not-a-jwt",
        "expired": cognito_token(iat=past, exp=past + timedelta(minutes=5)),
        "wrong app client": cognito_token(aud="some-other-client"),
        "wrong user pool": cognito_token(iss="https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_Other"),
        "access token": cognito_token(token_use="access"),
        "forged signature": cognito_token(key=rsa.generate_private_key(public_exponent=65537, key_size=2048)),
        "no email": cognito_token(email=""),
    }
    for label, token in bad.items():
        r = client.post(SESSION, headers=bearer(token) if token else {})
        assert r.status_code == 401, label
    assert sql("SELECT count(*) FROM users") == [(0,)]


def test_admin_role_comes_from_database(client, make_user):
    user = make_user()
    assert client.get("/api/admin/summary", headers=user["headers"]).status_code == 403
    sql("UPDATE users SET role = 'admin' WHERE id = %s", uuid.UUID(user["user"]["id"]))
    assert client.get("/api/admin/summary", headers=user["headers"]).status_code == 200


def test_static_jwks_works_without_network(client, monkeypatch, mode):
    """COGNITO_JWKS_JSON path: the real _signing_key runs, with no JWKS download."""
    import json

    from jwt.algorithms import RSAAlgorithm

    from app import security
    from tests.conftest import POOL_KEY

    monkeypatch.undo()  # restore the real _signing_key
    jwk = json.loads(RSAAlgorithm.to_jwk(POOL_KEY.public_key())) | {"kid": "test-kid", "alg": "RS256", "use": "sig"}
    mode(cognito_jwks_json=json.dumps({"keys": [jwk]}))
    monkeypatch.setattr(security, "_jwks_client", lambda: (_ for _ in ()).throw(AssertionError("network used")))

    assert client.post(SESSION, headers=bearer(cognito_token())).status_code == 200
    other = cognito_token(key=rsa.generate_private_key(public_exponent=65537, key_size=2048))
    assert client.post(SESSION, headers=bearer(other)).status_code == 401
