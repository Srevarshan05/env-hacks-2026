# Frontend ↔ backend API contract

Every example below is a **real response** captured from the backend (test data, so ids and times differ).
Base URL: `VITE_API_URL` (local network: `http://192.168.1.5:8080`; after deployment: the App Runner HTTPS URL).

## Rules the frontend must follow

- **Auth:** send the Cognito **ID token** on every call except the public machine endpoints:
  `Authorization: Bearer ${(await fetchAuthSession()).tokens.idToken.toString()}`.
  An access token is rejected with `401 invalid_token`.
- **The backend owns all numbers.** Points, balances, litres and reward rules come from these responses.
  Never calculate points or keep a balance in `localStorage`. Remove any browser-side "credits once an hour" logic.
- **Points rule:** 1 verified litre = 1 point, rounded down (1.25 L → 1 point). A refill under 1.00 L
  fails with `failure_reason: "volume_below_minimum"` and earns nothing.
- **Idempotency:** send a fresh `Idempotency-Key: crypto.randomUUID()` header on *Hydrate algae* and on *Redeem*.
  Reuse the same key only when retrying the *same* tap. A retry returns the original result instead of
  starting a second refill or spending points twice.
- **Errors** always look like `{"error": "<code>", "message": "<human text>", ...}`. Show `message`, branch on `error`.
  (Request-validation errors, HTTP 422, use FastAPI's `{"detail": [...]}` format.)

## Which call feeds which screen

| Screen | Call | Fields to use |
|---|---|---|
| QR landing `/m/:machineId` | `GET /api/machines/{id}` (no auth) | `name`, `location`, `available` |
| After Cognito sign-in | `POST /api/auth/session` | `user`, `machine.status` |
| Hydrate algae | `POST /api/refill-sessions`, then poll `GET /api/refill-sessions/{id}` every 1 s | `status`, `measured_liters`, `verified_liters`, `points_awarded`, `failure_reason` |
| Profile panel | `GET /api/profile` | `stats.points` (current credits), `stats.liters` (total water), `stats.refills`, `stats.lifetime_points`, `rank` |
| Dashboard | `GET /api/dashboard` | `stats`, `weekly` (7-day chart) |
| Rewards page: balance + catalogue | `GET /api/rewards` | `points`, `rewards[]` |
| Rewards page: redeem | `POST /api/rewards/{id}/redeem` | `balance` (new balance), `reward_title` |
| **Activity list** (refills + redemptions) | `GET /api/me/points?limit=50` | `ledger[]`: one row per points movement, newest first |
| Full history (optional) | `GET /api/history` | separate `contributions`, `refill_sessions`, `transactions`, `redemptions` lists |

## Auth

### `POST /api/auth/session`
Body (optional): `{"machine_id": "NODE-001"}` (the machine from the QR URL). Call once right after Cognito sign-in.
The user's RDS account is created on the first call (`is_new_user: true`).
```json
{
  "user": { "id": "80e90116-…", "full_name": "Asha Green", "email": "asha@example.com", "role": "user",
            "created_at": "2026-10-11T09:17:31.870499+00:00" },
  "is_new_user": true,
  "machine": { "machine_id": "NODE-001", "name": "Library Water Station",
               "location": "Library Building · Ground Floor", "active": true,
               "latitude": null, "longitude": null, "status": "ok" }
}
```
`machine` is `null` when no `machine_id` was sent. `machine.status` is `ok`, `inactive` or `not_found`.

### `GET /api/me`
```json
{ "user": { "id": "80e90116-…", "full_name": "Asha Green", "email": "asha@example.com", "role": "user",
            "created_at": "2026-10-11T09:17:31.870499+00:00" } }
```

## Machines (no auth)

### `GET /api/machines/{machine_id}`
```json
{ "machine_id": "NODE-001", "name": "Library Water Station", "location": "Library Building · Ground Floor",
  "active": true, "latitude": null, "longitude": null, "available": true }
```
`available: false` means someone else is refilling right now. Unknown id → `404 {"error": "machine_not_found"}`.

## Refills ("Hydrate algae")

### `POST /api/refill-sessions` (header `Idempotency-Key`)
Body: `{"machine_id": "NODE-001"}`. **Only** `machine_id`; sending `liters` or `points` → 422.
Returns `201` (new) or `200` (an existing open session for this user and machine, e.g. a double tap).
```json
{ "session_id": "c99f7c62-…", "machine_id": "NODE-001", "machine_name": "Library Water Station",
  "status": "created", "verification_mode": "simulator", "is_simulated": true,
  "measured_liters": 0.0, "verified_liters": null, "points_awarded": 0, "failure_reason": null,
  "created_at": "2026-10-11T09:00:00+00:00", "activated_at": null, "measuring_started_at": null,
  "measuring_ended_at": null, "finished_at": null }
```

### `GET /api/refill-sessions/{session_id}`: poll every second
While water flows (`measured_liters` rises 0.25 L/s in simulator mode):
```json
{ "session_id": "c99f7c62-…", "status": "measuring", "measured_liters": 0.5,
  "verified_liters": null, "points_awarded": 0, "failure_reason": null, "...": "same fields as above" }
```
Finished (about 7–8 s after the tap in simulator mode):
```json
{ "session_id": "c99f7c62-…", "machine_id": "NODE-001", "machine_name": "Library Water Station",
  "status": "approved", "verification_mode": "simulator", "is_simulated": true,
  "measured_liters": 1.25, "verified_liters": 1.25, "points_awarded": 1, "failure_reason": null,
  "created_at": "2026-10-11T09:00:00+00:00", "activated_at": "2026-10-11T09:00:00+00:00",
  "measuring_started_at": "2026-10-11T09:00:02+00:00", "measuring_ended_at": "2026-10-11T09:00:07+00:00",
  "finished_at": "2026-10-11T09:00:08+00:00" }
```
`status` flow: `created → active → measuring → verifying → approved`.
Stop polling on any **final** status: `approved`, `failed`, `cancelled`, `expired`. For anything other than
`approved`, show `failure_reason` (e.g. `volume_below_minimum`, `no_flow_detected`).
Add `?include_readings=true` to also get `readings: [{seq, cumulative_liters, source, measured_at}, …]` for a chart.

Other refill calls: `GET /api/refill-sessions/active` → `{"session": <session or null>}` (resume after a page reload),
`GET /api/refill-sessions?limit=20` → array of sessions, `POST /api/refill-sessions/{id}/cancel` (only before water flows).

## Profile, dashboard, activity

### `GET /api/profile`
```json
{ "user": { "id": "80e90116-…", "full_name": "Asha Green", "email": "asha@example.com", "role": "user",
            "created_at": "2026-10-11T09:17:31.870499+00:00" },
  "stats": { "points": 1, "refills": 3, "liters": 3.75, "lifetime_points": 3 },
  "rank": 1 }
```
`points` = current spendable credits; `lifetime_points` = everything ever earned; `liters` = total verified water.

### `GET /api/dashboard`
```json
{ "stats": { "points": 1, "refills": 3, "liters": 3.75 },
  "weekly": [ { "date": "2026-10-05", "day": "Mon", "points": 0 }, "… 7 days, oldest first …",
              { "date": "2026-10-11", "day": "Sun", "points": 3 } ],
  "environment": null,
  "machine_count": 3 }
```
`weekly[].points` = points *earned* per day (UTC). `environment` is the latest air-sensor reading or `null`.

### `GET /api/me/points?limit=50`: activity feed
```json
{ "balance": 1, "earned": 3, "spent": 2,
  "ledger": [
    { "id": "a6e35573-…", "type": "redemption_debit", "delta": -2,
      "reason": "Redeemed Reusable Bamboo Bottle", "created_at": "2026-10-11T09:17:32.350318+00:00",
      "reward_id": "956ba5ab-…", "reward_title": "Reusable Bamboo Bottle", "redemption_id": "180c4f89-…",
      "liters": null, "machine_id": null, "machine_name": null, "is_simulated": null, "contribution_id": null },
    { "id": "44677514-…", "type": "contribution_credit", "delta": 1,
      "reason": "Refill at Library Water Station [SIMULATED]", "created_at": "2026-10-11T09:17:32.295028+00:00",
      "liters": 1.25, "machine_id": "NODE-001", "machine_name": "Library Water Station", "is_simulated": true,
      "contribution_id": "8448157c-…", "reward_id": null, "reward_title": null, "redemption_id": null }
  ] }
```
Render each row by `type`:
- `contribution_credit`: "Refilled **{liters} L** at {machine_name}", **+{delta}** points, date `created_at`
- `redemption_debit`: "Redeemed **{reward_title}**", **{delta}** points (negative)
- `adjustment`: show `reason`

## Rewards

### `GET /api/rewards`
```json
{ "points": 3,
  "rewards": [ { "id": "956ba5ab-…", "title": "Reusable Bamboo Bottle",
                 "description": "Eco-friendly reusable bottle voucher.",
                 "points_cost": 2, "stock": 20, "active": true }, "…" ] }
```
Disable *Redeem* when `points < points_cost` or `stock === 0`. The backend enforces this either way.

### `POST /api/rewards/{reward_id}/redeem` (header `Idempotency-Key`)
`201` new redemption, `200` + `"replayed": true` when the same key is retried (no second charge):
```json
{ "redemption_id": "180c4f89-…", "reward_id": "956ba5ab-…", "reward_title": "Reusable Bamboo Bottle",
  "points_spent": 2, "status": "requested", "created_at": "2026-10-11T09:17:32.350318+00:00",
  "balance": 1, "replayed": false }
```
Not enough points:
```json
{ "error": "insufficient_points", "message": "You need 150 points but have 1.", "required": 150, "balance": 1 }
```
Digital voucher delivery is not implemented; `status: "requested"` means the reward is reserved for the user.

## Error codes

| HTTP | `error` | Meaning / UI action |
|---|---|---|
| 401 | `auth_required` | No token sent → go to login |
| 401 | `invalid_token` | Expired, wrong pool/client, or an **access** token was sent → refresh session / log in again |
| 409 | `account_conflict` | Email belongs to another account (or is unverified) |
| 404 | `machine_not_found` | Unknown QR / machine id |
| 409 | `machine_inactive` | Machine out of service |
| 409 | `machine_busy` | Someone else is refilling, so retry shortly |
| 409 | `user_has_open_session` | User already has a refill running elsewhere (`session_id`, `machine_id` included) |
| 409 | `cannot_cancel` | Water already flowing |
| 404 | `session_not_found` | Not this user's session |
| 404 | `reward_not_found` | Reward missing or inactive |
| 409 | `out_of_stock` | Reward stock is 0 |
| 409 | `insufficient_points` | Includes `required` and `balance` |
| 422 | (FastAPI `detail`) | Invalid request body, e.g. sending `liters` |
| 503 | `database_unavailable` | Backend can't reach the database; retry later |
