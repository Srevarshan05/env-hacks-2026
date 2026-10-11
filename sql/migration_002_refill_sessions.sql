-- migration_002: sensor-verified refill sessions (applied to RDS ecoair on 2026-10-11)
--
-- Additive and backward compatible:
--   * creates two NEW tables (refill_sessions, flow_readings)
--   * adds ONE nullable column to redemptions (idempotency_key) + a partial unique index
--   * does NOT alter, drop or rewrite any existing table, column, constraint or row
--
-- Why new tables instead of changing `contributions`:
--   contributions.status only allows pending/approved/rejected and liters must be > 0.
--   A refill session has richer states (created → active → measuring → verifying →
--   approved / failed / cancelled / expired) and starts at 0 L, so it cannot live in
--   contributions without loosening its constraints. Instead, a contributions row is
--   written ONLY when a session is approved (status='approved', reviewer_id NULL), and
--   refill_sessions.contribution_id links the two. Historical rows keep their meaning.
--
-- Exactly-once credit is enforced by the database, not only by Python:
--   refill_sessions.contribution_id UNIQUE  -> one contribution per session
--   points_ledger.contribution_id  UNIQUE   -> one credit per contribution (existing)
--
-- Apply manually with:  python -m scripts.apply_migration sql/migration_002_refill_sessions.sql --confirm-database <db_name>

BEGIN;

CREATE TABLE IF NOT EXISTS refill_sessions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id),
  node_id              TEXT NOT NULL REFERENCES nodes(id),
  status               TEXT NOT NULL DEFAULT 'created'
                         CHECK (status IN ('created','active','measuring','verifying',
                                           'approved','failed','cancelled','expired')),
  verification_mode    TEXT NOT NULL CHECK (verification_mode IN ('simulator','hardware')),
  -- Simulator parameters frozen at creation so a restart/config change cannot alter an in-flight session.
  simulator_profile    JSONB,
  measured_liters      NUMERIC(9,3) NOT NULL DEFAULT 0 CHECK (measured_liters >= 0),
  last_reading_seq     INTEGER,
  last_reading_at      TIMESTAMPTZ,
  verified_liters      NUMERIC(9,2) CHECK (verified_liters IS NULL OR verified_liters > 0),
  points_awarded       INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
  contribution_id      UUID UNIQUE REFERENCES contributions(id),
  failure_reason       TEXT,
  idempotency_key      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at         TIMESTAMPTZ,
  measuring_started_at TIMESTAMPTZ,
  measuring_ended_at   TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (contribution_id IS NOT NULL AND verified_liters IS NOT NULL))
);

-- One open session per machine: a physical measurement can never be shared between users.
CREATE UNIQUE INDEX IF NOT EXISTS refill_sessions_one_open_per_node
  ON refill_sessions(node_id) WHERE status IN ('created','active','measuring','verifying');
-- One open session per user (across all machines).
CREATE UNIQUE INDEX IF NOT EXISTS refill_sessions_one_open_per_user
  ON refill_sessions(user_id) WHERE status IN ('created','active','measuring','verifying');
-- Client retry protection for "Start Refill".
CREATE UNIQUE INDEX IF NOT EXISTS refill_sessions_user_idem
  ON refill_sessions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS refill_sessions_user_time ON refill_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refill_sessions_open
  ON refill_sessions(updated_at) WHERE status IN ('created','active','measuring','verifying');

CREATE TABLE IF NOT EXISTS flow_readings (
  id                BIGSERIAL PRIMARY KEY,
  session_id        UUID NOT NULL REFERENCES refill_sessions(id),
  seq               INTEGER NOT NULL CHECK (seq >= 0),
  cumulative_liters NUMERIC(9,3) NOT NULL CHECK (cumulative_liters >= 0),
  source            TEXT NOT NULL CHECK (source IN ('simulator','hardware')),
  measured_at       TIMESTAMPTZ NOT NULL,
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, seq)
);

-- Duplicate-safe reward redemption (client retries with the same Idempotency-Key).
ALTER TABLE redemptions ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS redemptions_user_idem
  ON redemptions(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

-- If the API connects as a separate least-privilege role, grant it access (replace APP_ROLE):
-- GRANT SELECT, INSERT, UPDATE ON refill_sessions, flow_readings TO APP_ROLE;
-- GRANT USAGE, SELECT ON SEQUENCE flow_readings_id_seq TO APP_ROLE;

COMMIT;
