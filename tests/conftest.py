"""Tests run against a THROWAWAY local PostgreSQL (never RDS).

    docker run -d --name refill-test-pg -e POSTGRES_PASSWORD=localtest -p 127.0.0.1:55432:5432 postgres:16-alpine
    TEST_ADMIN_DATABASE_URL=postgresql://postgres:localtest@127.0.0.1:55432/postgres pytest

The schema is rebuilt the way RDS was: schema.sql -> relaxed nodes_id_check (as on RDS)
-> migration_001 -> migration_002.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

ADMIN_URL = os.environ.get("TEST_ADMIN_DATABASE_URL", "postgresql://postgres:localtest@127.0.0.1:55432/postgres")
TEST_DB = "refill_backend_test"
ROOT = Path(__file__).resolve().parents[1]

for host in ("127.0.0.1", "localhost"):  # hard guard: tests may only ever touch a local server
    if f"@{host}:" in ADMIN_URL:
        break
else:
    raise RuntimeError("TEST_ADMIN_DATABASE_URL must point at a local throwaway PostgreSQL")

os.environ.update({
    "APP_ENV": "test",
    "DATABASE_URL": ADMIN_URL.rsplit("/", 1)[0] + "/" + TEST_DB,
    "DB_SSLMODE": "disable",
    "COGNITO_REGION": "ap-south-1",
    "COGNITO_USER_POOL_ID": "ap-south-1_TestPool1",
    "COGNITO_APP_CLIENT_IDS": "test-app-client",
    "DEVICE_API_KEY": "test-device-key-" + "y" * 32,
    "RUN_WORKER_IN_PROCESS": "false",
    "REFILL_VERIFICATION_MODE": "simulator",
})

DEVICE_HEADERS = {"X-Device-Key": os.environ["DEVICE_API_KEY"]}
T0 = datetime(2026, 10, 11, 9, 0, 0, tzinfo=timezone.utc)

# Stand-in for the Cognito user pool's signing key. Tests sign real RS256 tokens with it and
# the JWKS lookup is replaced, so signature/issuer/audience/expiry checks all run for real.
POOL_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
ISSUER = "https://cognito-idp.ap-south-1.amazonaws.com/ap-south-1_TestPool1"


def cognito_token(sub: str | None = None, email: str | None = None, name: str = "Test User", *,
                  email_verified: bool = True, key=POOL_KEY, **claims) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": sub or str(uuid.uuid4()), "email": f"u{uuid.uuid4().hex[:10]}@example.com" if email is None else email,
               "email_verified": email_verified, "name": name, "iss": ISSUER, "aud": "test-app-client",
               "token_use": "id", "iat": now, "exp": now + timedelta(hours=1), **claims}
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": "test-kid"})


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _build_schema():
    with psycopg.connect(ADMIN_URL, autocommit=True) as c:
        c.execute(f'DROP DATABASE IF EXISTS "{TEST_DB}" WITH (FORCE)')
        c.execute(f'CREATE DATABASE "{TEST_DB}"')
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        c.execute((ROOT / "sql/schema.sql").read_text(encoding="utf-8"))
        c.execute("ALTER TABLE nodes DROP CONSTRAINT IF EXISTS nodes_id_check;"
                  "ALTER TABLE nodes ADD CONSTRAINT nodes_id_check CHECK (id ~ '^(NODE-[0-9]{3,}|ECO-[A-Z0-9-]+)$')")
        c.execute((ROOT / "sql/migration_001.sql").read_text(encoding="utf-8"))
        c.execute((ROOT / "sql/migration_002_refill_sessions.sql").read_text(encoding="utf-8"))
        c.execute((ROOT / "sql/migration_003_cognito_users.sql").read_text(encoding="utf-8"))


@pytest.fixture(scope="session", autouse=True)
def database():
    _build_schema()
    yield


@pytest.fixture(autouse=True)
def clean(database):
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        c.execute("TRUNCATE flow_readings, refill_sessions, points_ledger, redemptions, contributions, users CASCADE")
        c.execute("UPDATE rewards SET stock = 20 WHERE title = 'Reusable Bamboo Bottle'")
        c.execute("INSERT INTO nodes(id, name, location) VALUES ('NODE-002', 'Hostel Station', 'Hostel') ON CONFLICT DO NOTHING")
        c.execute("UPDATE nodes SET active = true")
    yield


class Clock:
    def __init__(self, start: datetime):
        self.now = start

    def __call__(self) -> datetime:
        return self.now

    def advance(self, seconds: float) -> datetime:
        self.now += timedelta(seconds=seconds)
        return self.now


@pytest.fixture
def clock(monkeypatch):
    from app import clock as clock_module

    c = Clock(T0)
    monkeypatch.setattr(clock_module, "utcnow", c)
    return c


@pytest.fixture
def mode(monkeypatch):
    """Switch REFILL_VERIFICATION_MODE (or any setting) for a test."""
    from app.config import get_settings

    def set_env(**kw):
        for k, v in kw.items():
            monkeypatch.setenv(k.upper(), str(v))
        get_settings.cache_clear()

    yield set_env
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def cognito_keys(monkeypatch):
    from app import security

    monkeypatch.setattr(security, "_signing_key", lambda token: POOL_KEY.public_key())


@pytest.fixture
def client():
    from fastapi.testclient import TestClient

    from app.main import app

    return TestClient(app)  # no context manager: the background worker is not started


@pytest.fixture
def make_user(client):
    def make(role: str = "user", machine_id: str | None = None) -> dict:
        """Signs up through 'Cognito' and opens the backend session, like the frontend does."""
        token = cognito_token()
        r = client.post("/api/auth/session", json={"machine_id": machine_id}, headers=bearer(token))
        assert r.status_code == 200 and r.json()["is_new_user"] is True, r.text
        body = r.json()
        if role != "user":
            sql("UPDATE users SET role = %s WHERE id = %s", role, uuid.UUID(body["user"]["id"]))
        body["headers"] = bearer(token)
        return body

    return make


def sql(query: str, *params):
    with psycopg.connect(os.environ["DATABASE_URL"], autocommit=True) as c:
        cur = c.execute(query, params)
        return cur.fetchall() if cur.description else None
