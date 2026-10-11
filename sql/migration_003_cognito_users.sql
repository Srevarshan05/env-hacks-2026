-- migration_003: link application users to Amazon Cognito identities (applied to RDS ecoair on 2026-10-11)
--
-- Additive and backward compatible:
--   * adds ONE nullable column users.cognito_sub (the Cognito user's immutable "sub" claim)
--   * adds a partial unique index so one Cognito identity maps to exactly one users row
--   * existing rows, columns and constraints are untouched
--
-- Cognito now owns passwords. users.password_hash stays NOT NULL (unchanged); rows created
-- for Cognito users store the non-hash marker '!cognito-managed', which can never match a password.
-- Existing users are linked automatically the first time they sign in through Cognito with
-- the same, verified email address.
--
-- Apply manually with:  python -m scripts.apply_migration sql/migration_003_cognito_users.sql --confirm-database ecoair

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS cognito_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_cognito_sub_key ON users(cognito_sub) WHERE cognito_sub IS NOT NULL;

COMMIT;
