# Algae refill machine backend (Python / FastAPI)

Backend for the algae-based refill machines: accounts, QR machine context, sensor-verified refill sessions, points and rewards. The former Node.js/Express backend was removed; it remains in git history (commit `fbcdde3`).
It uses the **existing** RDS PostgreSQL tables, plus two new tables from a reviewed, additive migration.

## Layout

```
app/
  main.py            FastAPI app, /api/health, error handling, starts the worker thread
  config.py          all settings from env vars (.env locally, Secrets Manager on AWS)
  db.py              engine with TLS verify-full against the RDS CA bundle
  models.py          ORM models mapped onto the existing tables + migration_002 tables
  security.py        Cognito ID-token verification (JWKS), device key
  services/
    refills.py       refill session state machine, verification, exactly-once credit
    simulator.py     deterministic flow-sensor simulator (demo mode only)
    points.py        points rule + ledger balance
    rewards.py       locked, idempotent redemption
    users.py         Cognito identity -> RDS users row (created on first login)
  routers/           auth, machines, refills, account, rewards, admin, device
  worker.py          DB-backed worker (in-process thread, or `python -m app.worker`)
scripts/
  inspect_schema.py  READ-ONLY dump of the live schema + comparison with the ORM
  apply_migration.py applies one SQL file only after --confirm-database <name>
sql/
  schema.sql, migration_001.sql          original schema (already on RDS; used by tests)
  migration_002_refill_sessions.sql       refill sessions (applied to ecoair 2026-10-11)
tests/               44 tests against a throwaway local PostgreSQL (Cognito tokens signed with a test key)
```

## Database

The application database on RDS is **`ecoair`** (verified from `pg_database`). Inspect the live schema with `python -m scripts.inspect_schema`.

The RDS schema was originally built by the former Node.js tooling, which applied `schema.sql`, **relaxed `nodes_id_check`** to `^(NODE-[0-9]{3,}|ECO-[A-Z0-9-]+)$`, applied `migration_001.sql` (`rewards.description` plus seed data), and seeded an admin user.

### migration_003: Cognito link (applied to ecoair on 2026-10-11)

Adds one nullable column, `users.cognito_sub`, and a partial unique index on it. Nothing else changes. Rows created for Cognito users store the marker `!cognito-managed` in `password_hash` (still `NOT NULL`), which can never match a password. Existing users are linked to their Cognito identity the first time they sign in with the same **verified** email, so their history is kept.

```powershell
python -m scripts.apply_migration sql/migration_003_cognito_users.sql --confirm-database ecoair
```

### migration_002 (applied to ecoair on 2026-10-11)

| Change | Why |
|---|---|
| new `refill_sessions` | Holds the richer states (`created → active → measuring → verifying → approved / failed / cancelled / expired`). `contributions` can't, because its status only allows pending/approved/rejected and it requires `liters > 0`. |
| new `flow_readings` | An auditable record of every sensor reading (or simulated reading) behind a credit. |
| partial unique indexes | Allow one open session per machine and one per user, so a single physical measurement can never be split between users. |
| `redemptions.idempotency_key` (nullable) + partial unique index | Makes a retried redemption request safe to repeat. |

No existing table, column, constraint, or row is changed. A `contributions` row is written only when a session is approved (`status='approved'`, `reviewer_id NULL`), and `refill_sessions.contribution_id` links back to it. Historical rows keep their meaning.

The credit-exactly-once guarantee rests on database constraints: `refill_sessions.contribution_id UNIQUE` plus the existing `points_ledger.contribution_id UNIQUE`.

```powershell
python -m scripts.inspect_schema                      # read-only; run this first
python -m scripts.apply_migration sql/migration_002_refill_sessions.sql --confirm-database ecoair
```

If the API uses a separate least-privilege role, uncomment the `GRANT` lines at the end of the migration.

## Local setup

```powershell
python -m venv .venv; .venv\Scripts\activate
pip install -r requirements-dev.txt
Copy-Item .env.example .env      # then fill in values; .env is git-ignored
uvicorn app.main:app --reload --port 8080
```

### Tests (never touch RDS; a guard refuses non-local URLs)

```powershell
docker run -d --name refill-test-pg -e POSTGRES_PASSWORD=localtest -p 127.0.0.1:55432:5432 postgres:16-alpine
pytest
```

## Authentication (Amazon Cognito)

Cognito owns sign-up, email verification, login and passwords; this backend never sees a password.

1. **Frontend** (Create account / Log in screens) uses AWS Amplify Auth against the user pool:
   `signUp({ username: email, password, options: { userAttributes: { email, name } } })`,
   `confirmSignUp` (emailed code), then `signIn`.
2. The frontend reads the **ID token** (`fetchAuthSession()).tokens.idToken.toString()`) and sends it on every
   API call as `Authorization: Bearer <id_token>`. Amplify refreshes it automatically.
3. Right after sign-in it calls `POST /api/auth/session {"machine_id": "NODE-001"}`. The backend verifies the
   token (RS256 signature against the pool's JWKS, issuer, app client id, expiry, `token_use = id`), creates the
   user's row in RDS on first login (`is_new_user: true`), and echoes the scanned machine.
4. Logout is `signOut()` in the frontend; there is no backend logout.

Roles (`user` / `operator` / `admin`) live in the RDS `users.role` column. Promote with
`UPDATE users SET role = 'admin' WHERE email = '...'`.

**User pool settings:** sign-in with email; required attributes `email` and `name`; email verification on;
an app client **without** a client secret (browser apps can't keep one).

## Refill flow

1. The QR sticker encodes `{PUBLIC_APP_URL}/m/NODE-001`. The frontend calls `GET /api/machines/NODE-001`.
2. If the user isn't signed in, the frontend shows the Cognito Create account / Log in screens, keeping `machine_id` in the URL. After sign-in it calls `POST /api/auth/session` with that `machine_id`. The response echoes a `machine` object (`status: ok | inactive | not_found`) so the UI can continue to the refill page.
3. **Hydrate algae** (Start Refill): `POST /api/refill-sessions {"machine_id":"NODE-001"}`, with an optional `Idempotency-Key` header. The body **rejects** any `liters`/`points` fields.
4. The frontend polls `GET /api/refill-sessions/{id}` about once a second until `status` is terminal.

Progress is a pure function of stored state and elapsed time. Polling never adds water; the tests check this.

| Mode | How readings arrive | Who ends measuring |
|---|---|---|
| `simulator` | The worker writes deterministic readings (default 0.25 L/s for 5 s after a 2 s delay, giving 1.25 L and 12 points). | The schedule ends. |
| `hardware` | The device posts cumulative litres (see below). | The device sends `final: true`, or there are no readings for `FLOW_IDLE_TIMEOUT_S`. |

Verification checks that readings exist, come from the session's own mode, increase monotonically, and match the session total. It also checks `MIN_VERIFIED_LITERS ≤ volume ≤ MAX_SESSION_LITERS` and an average flow rate at or below `MAX_FLOW_RATE_LPS`.

The rule is `verified = truncate(measured, 0.01 L)` and `points = floor(verified × POINTS_PER_LITER)`, both in Decimal arithmetic. The contribution, ledger credit, and status change are committed in one transaction.

**Simulator and hardware are never mixed.** A session records its mode when it's created. It is only verified while the server runs in that same mode; otherwise it fails with `verification_mode_mismatch` and earns nothing. Device endpoints reject simulator sessions. Simulated credits are labelled `[SIMULATED]` in the ledger, and the API reports `is_simulated` and `verification_mode`.

**Timeouts:**

| From | To | When |
|---|---|---|
| `created` | `expired` | not activated within 60 s |
| `active` | `expired` | no flow within 120 s |
| hardware session | `failed` | still running after 600 s |

Users can cancel only before water flows. Staff can also cancel while a session is measuring.

**Recovery:** the `refill_sessions` table *is* the job queue. The worker claims rows with `FOR UPDATE SKIP LOCKED`, so any number of instances can run it, and a restarted instance continues where the last one stopped. The status endpoint also performs the same idempotent catch-up, which keeps sessions moving even when App Runner throttles CPU on an idle instance.

### Device protocol (hardware mode, header `X-Device-Key`)

```
GET  /api/device/machines/{id}/pending-session
POST /api/device/machines/{id}/sessions/{sid}/activate
POST /api/device/machines/{id}/sessions/{sid}/readings   {"seq":3,"cumulative_liters":0.75,"final":false}
POST /api/device/telemetry                               {"node_id":"NODE-001","co2_ppm":480,...}
```

Readings are idempotent per `seq` (a retry is safe). A conflicting value for the same `seq` returns 409. A total lower than the previous one returns 422.

**Physical presence:** a static QR doesn't prove someone is at the machine. In hardware mode a session stays `created` until **the machine itself** activates it, and that activation step is where a future proof-of-presence handshake belongs (e.g. a code on the machine's display that the user confirms). Today one `DEVICE_API_KEY` is shared by all devices. Move to per-device keys or AWS IoT credentials before running unattended in public.

## API summary

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | none (503 if the DB is down or tables are missing) |
| POST | `/api/auth/session` (create or load the RDS user, echo machine) | Cognito ID token |
| GET | `/api/me`, `/api/auth/me` | user |
| GET | `/api/machines`, `/api/machines/{id}`, `/api/machines/{id}/readings/latest` | none |
| POST | `/api/refill-sessions` | user |
| GET | `/api/refill-sessions`, `/active`, `/{id}[?include_readings=true]` | owner |
| POST | `/api/refill-sessions/{id}/cancel` | owner |
| GET | `/api/me/points`, `/api/dashboard`, `/api/history`, `/api/profile` | user |
| GET | `/api/rewards` | user |
| POST | `/api/rewards/{id}/redeem` (with `Idempotency-Key`) | user |
| GET | `/api/admin/summary`, `/api/admin/refill-sessions` | admin, operator |
| POST | `/api/admin/refill-sessions/{id}/cancel` | admin, operator |
| POST/PATCH | `/api/admin/machines[/{id}]`, POST `/api/admin/rewards` | admin |
| GET | `/api/admin/machines/{id}/qr` (SVG for printing) | admin |

Interactive docs are served at `/docs` (disabled when `APP_ENV=production`).

**Removed on purpose:**
- `POST /api/refills` (old Node API), which accepted client-entered litres.
- The manual operator approval flow.
- The unstored random "voucher code".
- The `plasticAvoided` figure.

## Deploying to App Runner

1. `docker build -t refill-backend .` and push the image to ECR. The image downloads the public RDS CA bundle and runs as a non-root user on port 8080.
2. Create an App Runner service from that image on port 8080, with health check `/api/health`.
3. Add a VPC connector in the VPC of `hackathon-rdb`. Allow its security group inbound on 5432 in `sg-0841ff7f1f742e5c2` (from the connector's SG only, never `0.0.0.0/0`).
4. Set `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DEVICE_API_KEY` from Secrets Manager. Set `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_IDS`, `REFILL_VERIFICATION_MODE`, `CORS_ORIGINS`, and `PUBLIC_APP_URL` as plain env vars (they aren't secrets).
   Verifying tokens needs the user pool's public keys (JWKS). With a VPC connector, App Runner sends **all** outbound traffic through your VPC, so downloading them needs a NAT gateway. To avoid that cost, paste the contents of `https://cognito-idp.ap-south-1.amazonaws.com/<pool id>/.well-known/jwks.json` into `COGNITO_JWKS_JSON`. The keys are public and not secret.
5. Production mode refuses to start without `DB_SSLMODE=verify-full` and a `DEVICE_API_KEY`; every mode requires the Cognito pool id and app client id.

