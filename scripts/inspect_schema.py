"""READ-ONLY inspection of the configured database. Changes nothing.

    python -m scripts.inspect_schema

Prints the connected database/user, every public table's columns, constraints,
indexes, row counts and privileges, then compares them against the ORM models.
The session is opened with default_transaction_read_only=on as a safety net.
"""

from sqlalchemy import create_engine, inspect, text

from app.db import build_url, connect_args
from app.models import Base


def main() -> None:
    args = connect_args() | {"options": "-c default_transaction_read_only=on"}
    engine = create_engine(build_url(), connect_args=args)
    with engine.connect() as conn:
        db, user, version = conn.execute(text("SELECT current_database(), current_user, version()")).one()
        print(f"database: {db}\nuser:     {user}\nserver:   {version.split(',')[0]}")
        print("databases on server:", conn.execute(text(
            "SELECT string_agg(datname, ', ' ORDER BY datname) FROM pg_database WHERE NOT datistemplate")).scalar())

        insp = inspect(conn)
        tables = sorted(insp.get_table_names(schema="public"))
        print(f"\npublic tables: {', '.join(tables)}")
        for t in tables:
            owner = conn.execute(text("SELECT tableowner FROM pg_tables WHERE schemaname='public' AND tablename=:t"), {"t": t}).scalar()
            count = conn.execute(text(f'SELECT count(*) FROM public."{t}"')).scalar()
            privs = conn.execute(text(
                "SELECT string_agg(privilege_type, ',' ORDER BY privilege_type) FROM information_schema.table_privileges "
                "WHERE table_schema='public' AND table_name=:t AND grantee=current_user"), {"t": t}).scalar()
            print(f"\n== {t}  (owner={owner}, rows={count}, my privileges={privs or 'owner/none'})")
            # format_type gives the exact type (SQLAlchemy prints timestamptz as plain "TIMESTAMP").
            for name, typ, notnull, default in conn.execute(text(
                "SELECT a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid) "
                "FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum "
                "WHERE a.attrelid = to_regclass(:t) AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum"),
                {"t": f'public."{t}"'}):
                print(f"   {name:<22} {typ:<28} {'NOT NULL' if notnull else 'NULL'}{'  default ' + default if default else ''}")
            for row in conn.execute(text(
                "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conrelid = to_regclass(:t) ORDER BY contype, conname"), {"t": f'public."{t}"'}):
                print(f"   [constraint] {row[0]}: {row[1]}")
            for row in conn.execute(text(
                "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=:t ORDER BY indexname"), {"t": t}):
                print(f"   [index] {row[0]}")

        print("\n== ORM comparison")
        ok = True
        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                print(f"   MISSING TABLE {table.name}" + ("  (expected until migration_002 is applied)"
                      if table.name in ("refill_sessions", "flow_readings") else ""))
                ok = False
                continue
            live = {c["name"] for c in insp.get_columns(table.name, schema="public")}
            for col in table.columns:
                if col.name not in live:
                    print(f"   MISSING COLUMN {table.name}.{col.name}")
                    ok = False
        print("   all ORM tables/columns present" if ok else "   differences found (see above)")


if __name__ == "__main__":
    main()
