CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','operator')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS nodes (
 id TEXT PRIMARY KEY CHECK (id ~ '^NODE-[0-9]{3,}$'),
 name TEXT NOT NULL,
 location TEXT NOT NULL,
 latitude DOUBLE PRECISION,
 longitude DOUBLE PRECISION,
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contributions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id),
 node_id TEXT NOT NULL REFERENCES nodes(id),
 liters NUMERIC(9,2) NOT NULL CHECK (liters > 0 AND liters <= 100),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 points_awarded INTEGER NOT NULL DEFAULT 0 CHECK (points_awarded >= 0),
 reviewer_id UUID REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 reviewed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS points_ledger (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id),
 delta INTEGER NOT NULL CHECK(delta <> 0),
 reason TEXT NOT NULL,
 contribution_id UUID UNIQUE REFERENCES contributions(id),
 redemption_id UUID UNIQUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS rewards (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 title TEXT NOT NULL,
 points_cost INTEGER NOT NULL CHECK(points_cost > 0),
 stock INTEGER NOT NULL DEFAULT 0 CHECK(stock >= 0),
 active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS redemptions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id),
 reward_id UUID NOT NULL REFERENCES rewards(id),
 points_spent INTEGER NOT NULL CHECK(points_spent > 0),
 status TEXT NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','fulfilled','cancelled')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='redemption_fk' AND conrelid='points_ledger'::regclass) THEN ALTER TABLE points_ledger ADD CONSTRAINT redemption_fk FOREIGN KEY(redemption_id) REFERENCES redemptions(id); END IF; END $$;
CREATE TABLE IF NOT EXISTS sensor_readings (
 id BIGSERIAL PRIMARY KEY,
 node_id TEXT NOT NULL REFERENCES nodes(id),
 co2_ppm NUMERIC(10,2),
 so2_ppb NUMERIC(10,2),
 pm25_ug_m3 NUMERIC(10,2),
 temperature_c NUMERIC(7,2),
 humidity_pct NUMERIC(6,2),
 water_level_pct NUMERIC(6,2),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sensor_node_time ON sensor_readings(node_id,recorded_at DESC);
CREATE INDEX IF NOT EXISTS contributions_user_time ON contributions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_user_time ON points_ledger(user_id,created_at DESC);
