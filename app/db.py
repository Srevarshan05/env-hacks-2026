from collections.abc import Iterator
from functools import lru_cache

from sqlalchemy import Engine, create_engine, text
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_settings

REQUIRED_TABLES = (
    "users", "nodes", "contributions", "points_ledger", "rewards", "redemptions",
    "sensor_readings", "refill_sessions", "flow_readings",
)
# Columns added to pre-existing tables by migrations 002 and 003.
REQUIRED_COLUMNS = (("redemptions", "idempotency_key"), ("users", "cognito_sub"))


def build_url() -> URL:
    s = get_settings()
    if s.database_url:
        url = make_url(s.database_url)
    else:
        url = URL.create("postgresql", s.db_user, s.db_password, s.db_host, s.db_port, s.db_name)
    # Always use the psycopg 3 driver; strip any ssl params so DB_SSLMODE is the single source of truth.
    query = {k: v for k, v in url.query.items() if not k.startswith("ssl")}
    return url.set(drivername="postgresql+psycopg", query=query)


def connect_args() -> dict:
    s = get_settings()
    args: dict = {"sslmode": s.db_sslmode, "connect_timeout": 10}
    if s.db_sslmode in ("verify-ca", "verify-full"):
        if not s.db_ca_path:
            raise RuntimeError("DB_CA_PATH is required for certificate verification")
        args["sslrootcert"] = s.db_ca_path
    return args


@lru_cache
def get_engine() -> Engine:
    s = get_settings()
    return create_engine(
        build_url(),
        connect_args=connect_args(),
        pool_size=s.db_pool_size,
        max_overflow=2,
        pool_pre_ping=True,
        pool_recycle=1800,
    )


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = get_sessionmaker()()
    try:
        yield db
    finally:
        db.close()


def missing_schema(db: Session) -> list[str]:
    """Tables and migration-added columns the code needs but the database lacks."""
    rows = db.execute(text("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'"))
    present = {(t, c) for t, c in rows}
    tables = {t for t, _ in present}
    return [t for t in REQUIRED_TABLES if t not in tables] + [
        f"{t}.{c}" for t, c in REQUIRED_COLUMNS if t in tables and (t, c) not in present
    ]
