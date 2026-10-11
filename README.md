# Algae Refill Backend: FastAPI · Cognito · RDS · Lambda

Backend for **public, algae-based air-purifier units that anyone can refill with water**. Each unit carries a QR
sticker. A user scans it, signs in, taps **Hydrate algae**, and earns points for the water that was actually
measured. Points can be spent on rewards.

> **Flow sensor status:** the physical flow sensor is not integrated yet. Refills are measured by a deterministic,
> **server-side simulator**, and every simulated result is labelled (`verification_mode: "simulator"`,
> `is_simulated: true`, `[SIMULATED]` in the points ledger). The hardware path (device API) is built and tested,
> and is enabled with `REFILL_VERIFICATION_MODE=hardware`.

Part of the **env-hacks-2026** project by team **.env**. Branches: `web-app-backend` (this backend),
`webapp-fronted` (React frontend), `iot-air-node` (ESP32 air-quality node).

---

## Contents
- [Architecture](#architecture)
- [How a refill works](#how-a-refill-works)
- [Project structure](#project-structure)
- [Run locally](#run-locally)
- [Configuration](#configuration)
- [Tests](#tests)
- [Database and migrations](#database-and-migrations)
- [Authentication (Amazon Cognito)](#authentication-amazon-cognito)
- [API](#api)
- [Device API (hardware mode)](#device-api-hardware-mode)
- [Deployment (AWS Lambda)](#deployment-aws-lambda)
- [Security notes and roadmap](#security-notes-and-roadmap)

## Architecture

```text
 QR sticker ──► https://<frontend>/m/NODE-001          (AWS Amplify Hosting, React)
                     │
   sign-up / login ──┼──► Amazon Cognito user pool     (Amplify Auth in the browser)
                     │
     HTTPS + Cognito ID token
                     ▼
        AWS Lambda Function URL                         (this repo: one FastAPI container image)
                     │  private, inside the VPC
                     ▼
        Amazon RDS for PostgreSQL                       (users, machines, refills, points, rewards)
```

| Concern | Choice |
|---|---|
| API | FastAPI + SQLAlchemy 2 + psycopg 3, Python 3.12 |
| Auth | Amazon Cognito: the frontend signs in, the backend verifies ID tokens (RS256 / JWKS) |
| Database | Amazon RDS for PostgreSQL, TLS with `sslmode=verify-full` |
| Hosting | AWS Lambda (container image from Amazon ECR) via the AWS Lambda Web Adapter + Function URL |
| Frontend | AWS Amplify Hosting (separate branch), auto-deploys from GitHub |

## How a refill works

1. **Scan.** The QR encodes only the machine id (`/m/NODE-001`). The frontend loads `GET /api/machines/NODE-001`.
2. **Sign in** with Cognito. The frontend calls `POST /api/auth/session {"machine_id": "NODE-001"}`; the user's
   database row is created on first login.
3. **Hydrate algae:** `POST /api/refill-sessions {"machine_id": "NODE-001"}`. The body accepts **only** the machine
   id. Sending `liters` or `points` is rejected with `422`.
4. The flow sensor (today: the simulator) reports cumulative litres; the UI polls `GET /api/refill-sessions/{id}`.
5. The backend verifies the readings, approves the contribution and credits points **exactly once**.

**State machine:**

```text
created → active → measuring → verifying → approved
     └──────┴──────────┴─► expired / cancelled / failed
```

Every transition runs under a row lock (`SELECT … FOR UPDATE`). A terminal session can never earn points.

**Points rule:** `verified = truncate(measured, 0.01 L)` and `points = floor(verified × POINTS_PER_LITER)`, with
`POINTS_PER_LITER = 1` (1.25 L → 1 point), all in `Decimal`. Refills below `MIN_VERIFIED_LITERS` (1.00 L) fail
with `volume_below_minimum`.

**Verification** checks that readings exist, come from the session's own mode, only increase, match the session
total, stay within `MAX_SESSION_LITERS`, and imply a plausible average flow rate (`MAX_FLOW_RATE_LPS`).

**Exactly-once credit and safe redemption**
- The balance is always `SUM(delta)` over `points_ledger`; the ledger is the only source of truth.
- `refill_sessions.contribution_id UNIQUE` + `points_ledger.contribution_id UNIQUE` make a double credit impossible.
- Contribution, ledger credit and the `approved` status are written in **one transaction**.
- Partial unique indexes allow one open session per machine and per user.
- `Idempotency-Key` headers make retried *Hydrate* and *Redeem* taps safe.
- Redemption locks the user's row before checking the balance, so concurrent taps can't overspend.

**Simulator vs hardware.** The mode is fixed on each session when it is created, and a session is only verified
while the server runs in that same mode (otherwise it fails with `verification_mode_mismatch`). Hardware mode never
falls back to simulated approval. The default simulator profile is 0.25 L/s for 5 s after a 2 s delay
(1.25 L → 1 point), identical on every run.

**No dependence on a background process.** Session progress is a pure function of stored state and elapsed time.
A DB-backed worker (`FOR UPDATE SKIP LOCKED`) advances sessions on long-running hosts. On serverless hosting, status
polls advance the session they read, and starting a refill or checking a machine first completes any session someone
abandoned. Polling never adds water.

| Timeout (hardware mode; simulator sessions follow their fixed schedule) | Result |
|---|---|
| `created` not activated by the machine within 60 s | `expired` (`machine_not_activated`) |
| `active` with no flow within 120 s | `expired` (`no_flow_detected`) |
| hardware session still running after 600 s | `failed` (`max_duration_exceeded`) |

## Project structure

```text
app/
  main.py              FastAPI app, /api/health, error handling, optional in-process worker
  config.py            all settings from environment variables (.env locally)
  db.py                engine (TLS verify-full), schema checks for /api/health
  models.py            ORM models for the existing tables + migration tables
  security.py          Cognito ID-token verification (JWKS), device key check
  deps.py              auth dependencies, role checks
  schemas.py           request models and response shaping
  worker.py            DB-backed worker (`python -m app.worker`)
  services/
    refills.py         refill state machine, verification, exactly-once credit
    simulator.py       deterministic flow simulator
    points.py          points rule and ledger balance
    rewards.py         locked, idempotent redemption
    users.py           Cognito identity → users row (first login, verified-email linking)
  routers/             auth, machines, refills, account, rewards, admin, device
scripts/
  inspect_schema.py    READ-ONLY dump of the live schema + comparison with the ORM
  apply_migration.py   applies one SQL file, only with --confirm-database <name>
sql/                   schema.sql, migration_001 … migration_004
tests/                 47 tests against a throwaway local PostgreSQL
docs/FRONTEND_API.md   request/response examples for the frontend
Dockerfile             one image for Docker and AWS Lambda
```

## Run locally

Requirements: Python 3.12+, access to the PostgreSQL database, the
[RDS CA bundle](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem) saved as `global-bundle.pem`,
and a Cognito user pool.

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
Copy-Item .env.example .env        # fill in your values; .env is git-ignored
uvicorn app.main:app --reload --port 8080
```

Open `http://localhost:8080/api/health` and `http://localhost:8080/docs` (interactive docs, disabled in production).

## Configuration

All settings are environment variables (see [.env.example](.env.example)). The most important ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` or `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD` | PostgreSQL connection |
| `DB_SSLMODE`, `DB_CA_PATH` | TLS; production requires `verify-full` |
| `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_APP_CLIENT_IDS` | which user pool / app client tokens must come from |
| `COGNITO_JWKS_JSON` | optional: the pool's public keys, for hosts without internet access |
| `REFILL_VERIFICATION_MODE` | `simulator` or `hardware` |
| `POINTS_PER_LITER`, `MIN_VERIFIED_LITERS` | points rule (defaults 1 and 1.00) |
| `CORS_ORIGINS` | comma-separated frontend origins allowed to call the API |
| `PUBLIC_APP_URL` | frontend base URL encoded into QR stickers (`{PUBLIC_APP_URL}/m/{machine_id}`) |
| `DEVICE_API_KEY` | shared key for the device API (required in production) |
| `RUN_WORKER_IN_PROCESS`, `DB_POOL_SIZE` | worker thread on/off, connections per instance |

**Never commit `.env`, `*.pem`, passwords or tokens.** Both are git-ignored.

## Tests

The tests never touch RDS. A guard refuses any non-local database URL.

```powershell
docker run -d --name refill-test-pg -e POSTGRES_PASSWORD=localtest -p 127.0.0.1:55432:5432 postgres:16-alpine
pytest
```

The suite rebuilds the production schema from `sql/` and covers the full refill flow, concurrency (simultaneous
starts, credits and redemptions), the hardware device protocol, timeouts, mode switching and Cognito token
validation, using real RS256 tokens signed with a test key.

## Database and migrations

The backend runs on an **existing** PostgreSQL database. Migrations are additive, reviewed, and **never run
automatically**.

| File | Change |
|---|---|
| `schema.sql`, `migration_001.sql` | original schema and seed data |
| `migration_002_refill_sessions.sql` | `refill_sessions`, `flow_readings`, `redemptions.idempotency_key` |
| `migration_003_cognito_users.sql` | `users.cognito_sub` + unique index |
| `migration_004_reprice_rewards.sql` | reward costs for the 1 point per litre rule |

```powershell
python -m scripts.inspect_schema                         # read-only; compare the live schema with the code
python -m scripts.apply_migration sql/<file>.sql --confirm-database <database name>
```

`apply_migration` refuses to run unless `--confirm-database` matches the database it actually connected to.

## Authentication (Amazon Cognito)

Cognito owns sign-up, email verification, login and passwords. This backend never sees a password.

1. The frontend uses Amplify Auth: `signUp` (attributes `email`, `name`), `confirmSignUp`, `signIn`.
2. It sends the **ID token** on every call: `Authorization: Bearer <idToken>`. Access tokens are rejected.
3. The backend checks the RS256 signature against the pool's JWKS, plus issuer, app client id, expiry and
   `token_use = id`.
4. On first login the user's database row is created, keyed by the Cognito `sub`. Pre-existing users are linked by
   email **only if Cognito marks the email verified**.

Roles (`user`, `operator`, `admin`) live in `users.role`. Promote with `UPDATE users SET role = 'admin' WHERE email = '…'`.

**User pool settings:** sign in with email; required attributes `email` and `name`; email verification on; an app
client **without** a client secret.

## API

Full request/response examples, the screen-to-endpoint map and error codes:
**[docs/FRONTEND_API.md](docs/FRONTEND_API.md)**.

| Method | Path | Auth |
|---|---|---|
| GET | `/api/health` | none (503 if the DB or schema isn't ready) |
| POST | `/api/auth/session` | Cognito ID token |
| GET | `/api/me` | user |
| GET | `/api/machines`, `/api/machines/{id}`, `/api/machines/{id}/readings/latest` | none |
| POST | `/api/refill-sessions` (`Idempotency-Key`) | user |
| GET | `/api/refill-sessions`, `/api/refill-sessions/active`, `/api/refill-sessions/{id}` | owner |
| POST | `/api/refill-sessions/{id}/cancel` | owner |
| GET | `/api/profile`, `/api/dashboard`, `/api/me/points`, `/api/history` | user |
| GET | `/api/rewards` | user |
| POST | `/api/rewards/{id}/redeem` (`Idempotency-Key`) | user |
| GET | `/api/admin/summary`, `/api/admin/refill-sessions` | admin, operator |
| POST | `/api/admin/refill-sessions/{id}/cancel` | admin, operator |
| POST / PATCH | `/api/admin/machines[/{id}]`, POST `/api/admin/rewards` | admin |
| GET | `/api/admin/machines/{id}/qr` (SVG sticker) | admin |

Errors look like `{"error": "<code>", "message": "<text>"}`; request-validation errors (`422`) use FastAPI's `{"detail": [...]}` format.

## Device API (hardware mode)

For the ESP32 / Raspberry Pi flow-sensor controller. Requires the `X-Device-Key` header.

```text
GET  /api/device/machines/{id}/pending-session
POST /api/device/machines/{id}/sessions/{sid}/activate
POST /api/device/machines/{id}/sessions/{sid}/readings   {"seq": 3, "cumulative_liters": 0.75, "final": false}
POST /api/device/telemetry                               {"node_id": "NODE-001", "co2_ppm": 480, ...}
```

Readings are idempotent per `seq`. A conflicting value for the same `seq` returns `409`; a decreasing total returns
`422`. The session ends on `final: true` or after `FLOW_IDLE_TIMEOUT_S` without readings.

## Deployment (AWS Lambda)

The same Docker image runs on AWS Lambda through the
[AWS Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) (one `COPY` line in the `Dockerfile`;
inactive outside Lambda), exposed over HTTPS by a **Lambda Function URL**.

| Piece | Setup |
|---|---|
| Image | Amazon ECR repository `refill-backend`, built for `linux/amd64` |
| Function | `refill-backend`: container image, 1536 MB, 30 s timeout |
| Network | the database's VPC subnets and a security group that can reach RDS; no NAT gateway needed |
| HTTPS | Function URL, auth type `NONE` (the app enforces Cognito); resource policy grants `lambda:InvokeFunctionUrl` **and** `lambda:InvokeFunction` with condition `lambda:InvokedViaFunctionUrl` |
| Role | execution role with `AWSLambdaVPCAccessExecutionRole` |
| Config | environment variables as in [Configuration](#configuration), with `APP_ENV=production`, `RUN_WORKER_IN_PROCESS=false`, `DB_POOL_SIZE=2`, and `COGNITO_JWKS_JSON` (the VPC function has no internet access) |
| Logs | CloudWatch Logs `/aws/lambda/refill-backend` |

**Redeploy after a code change** (PowerShell, repo root; set your account id):

```powershell
$account = "<AWS_ACCOUNT_ID>"; $region = "ap-south-1"
$repo = "$account.dkr.ecr.$region.amazonaws.com/refill-backend"; $tag = git rev-parse --short HEAD
aws ecr get-login-password --region $region | docker login --username AWS --password-stdin "$account.dkr.ecr.$region.amazonaws.com"
docker buildx build --platform linux/amd64 --provenance=false --sbom=false -t "${repo}:$tag" --load .
docker push "${repo}:$tag"
aws lambda update-function-code --function-name refill-backend --image-uri "${repo}:$tag"
```

`--provenance=false` keeps the image manifest in a format Lambda accepts. When the frontend gets a new domain, add
it to `CORS_ORIGINS` (comma-separated) in the function's environment variables.

Observed performance: about 3 s on a cold start after idle, about 0.2 s warm.

## Security notes and roadmap

- Secrets come only from environment variables; `.env` and certificate files are git-ignored.
- Database connections verify the server certificate (`verify-full`).
- Clients never send litres or points; all numbers come from verified readings and the ledger.

Planned before unattended public use:
- integrate the real flow sensor and switch to `hardware` mode
- a proof-of-presence handshake (e.g. a code on the machine's display), since a static QR is not proof
- per-device credentials instead of one shared `DEVICE_API_KEY`
- a least-privilege database user, private-only database access, and secrets in AWS Secrets Manager

---

The previous Node.js/Express implementation is preserved in git history (commit `fbcdde3`).
