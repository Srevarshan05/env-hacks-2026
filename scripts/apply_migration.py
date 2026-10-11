"""Apply ONE reviewed SQL migration file, only after explicit confirmation.

    python -m scripts.apply_migration sql/migration_002_refill_sessions.sql --confirm-database ecoair

Refuses to run unless --confirm-database matches the database actually connected to.
The migration files wrap themselves in BEGIN/COMMIT, so a failure leaves nothing applied.
Nothing in the API ever runs migrations automatically.
"""

import argparse
import sys
from pathlib import Path

import psycopg

from app.config import get_settings
from app.db import build_url, connect_args


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("sql_file", type=Path)
    p.add_argument("--confirm-database", required=True, help="name of the database you intend to change")
    a = p.parse_args()

    sql = a.sql_file.read_text(encoding="utf-8")
    url = build_url()
    with psycopg.connect(
        host=url.host, port=url.port or 5432, dbname=url.database, user=url.username, password=url.password,
        autocommit=True,  # the SQL file manages its own BEGIN/COMMIT
        **connect_args(),
    ) as conn:
        db, user = conn.execute("SELECT current_database(), current_user").fetchone()
        print(f"Connected to database '{db}' on {url.host} as '{user}' (APP_ENV={get_settings().app_env})")
        if db != a.confirm_database:
            print(f"Refusing: --confirm-database '{a.confirm_database}' does not match '{db}'.")
            return 2
        conn.execute(sql)
        print(f"Applied {a.sql_file}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
