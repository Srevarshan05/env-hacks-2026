# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

React 19 + TypeScript + Vite frontend for ".env": **Thin-Film Algae-Based Air Purifier with AWS Cloud Integration** (BME680 sensor nodes, LoRa, AWS). Routing via react-router-dom v7, charts via Recharts, icons via lucide-react, auth via AWS Amplify (Cognito).

Note: the enclosing git repository is rooted at the user's home directory (`C:/Users/shamy`), not this folder. Be careful with `git status`/`git add` — scope commands to this directory.

## Commands

```sh
npm run dev       # Vite dev server on http://127.0.0.1:5173
npm run build     # tsc -b (type check) + vite build -> dist/
npm run preview   # serve dist/
npm run test:ui   # Playwright browser verification (scripts/verify-ui.mjs)
npm run deploy    # build + manual zip deployment to AWS Amplify (scripts/deploy-amplify.ps1)
```

There is no linter or unit-test runner. `npm run build` is the type check. `test:ui` is a single end-to-end script (no per-test selection): it requires the dev server already running (override with `TEST_BASE_URL`), launches headless **Microsoft Edge** (`channel: 'msedge'`), writes screenshots to `test-results/`, and spins up its own temporary Vite server to exercise API responses. Its assertions check specific class names (`.story-backdrop`, `.chapter-N`, `.story-track`, etc.), asset filenames, fonts (Sora), absence of horizontal overflow, and console errors — update it when changing those.

## Architecture

- `src/main.tsx` imports `src/config/amplify.js` (configures Cognito from `VITE_COGNITO_USER_POOL_ID` / `VITE_COGNITO_CLIENT_ID`) before rendering. `src/App.tsx` defines all routes under a shared `Layout`; `Dashboard` is lazy-loaded.
- **Sensor data flow:** readings come from a separate read-only Lambda over DynamoDB (`sensor-api/`, `VITE_SENSOR_API_URL` → `apiConfig.sensorBaseUrl`; see `docs/sensor-readings-api.md`); dashboard nodes map to device IDs via `NodeInfo.sensorId`. `src/config/api.ts` centralizes base URL, provisional endpoint templates, poll interval (10s), timeout, and stale threshold (35s). `src/services/readings.ts` validates payloads, fetches latest + history, sorts/dedupes, and provides a deterministic sample feed. `src/hooks/useSensorFeed.ts` polls and derives status (`Sample feed` / `Online` / `Offline` / `Unavailable`). Sample mode is on unless `VITE_USE_SAMPLE_DATA` (or legacy `VITE_USE_DEMO_DATA`) is `'false'`. With sample mode off, failures must never silently fall back to sample data.
- **Points, refills, rewards (backend-owned):** all numbers come from the FastAPI backend; never compute points or keep a balance in localStorage. `services/apiService.ts` holds typed calls matching the backend contract (`startSession`, `getProfile` → `stats.points/liters/refills/lifetime_points`, `getPointsFeed` → `ledger[]`, `getRewards`/`redeemReward`, `startRefill`/`getRefillSession`/`getActiveRefill`). `hooks/useRefill.ts` POSTs `/api/refill-sessions` with a fresh `Idempotency-Key` and polls every 1 s until `approved|failed|cancelled|expired`; used by `components/Hydration.tsx` (dashboard, via `NodeInfo.machineId`) and `pages/Machine.tsx` (QR route `/m/:machineId`). Redeem uses one `Idempotency-Key` per tap, reused only on retry. Backend errors are `{error, message}`; `ApiError.code` carries `error`.
- **Auth:** `src/services/authService.ts` wraps Amplify (`signUp` with the `name` attribute, `confirmSignUp`, `signIn`, `signOut`) directly from the browser and also holds the shared sign-in state store (`getAuthState`/`subscribeAuth`, fed by Amplify `Hub` events), consumed through `hooks/useAuth.ts`. `components/RequireAuth.tsx` guards `/rewards`; `Hydration` shows a log-in link when signed out; `Layout` swaps Log in/Log out. `services/apiService.ts` (`apiFetch`, `getMe`) attaches the Cognito ID token (not the access token; the backend requires `token_use: id`) for the FastAPI backend; `apiConfig.profileSync` (`VITE_PROFILE_SYNC=true`) makes login call `GET /api/me`. The RDS database is reached only by the backend (see `docs/backend-auth-integration.md`); `docs/authentication-contract.md` and `docs/cognito-authentication-setup.md` describe an older, unadopted design.
- **Landing page:** `pages/Home.tsx` + `hooks/useStoryMotion.ts` + `animation/airCamera.ts` implement a five-slide scroll story that pans a camera across one image (`public/assets/air-treatment-journey-v1.png`). One wheel gesture/key/swipe advances exactly one slide (780 ms); a reduced-motion variant renders a static story.
- **Static data:** `src/data/nodes.ts` (node IDs, coordinates, images in `public/images/nodes/`), `team.ts`, `rewards.ts`, `india.json` (Natural Earth outline projected in `components/IndiaMap.tsx`).
- All styling is in `src/styles.css`. Fonts are self-hosted in `public/fonts/`; no runtime external asset loading.

## Constraints

- All `VITE_` variables are public. Never put AWS credentials, client secrets, or device tokens in them.
- Do not label BME680 gas resistance as AQI/CO₂/CO/NO₂/PM2.5, and don't invent carbon-capture or algae-health metrics. Gas resistance is stored in Ω and displayed in kΩ.
- Online/offline is derived only from reading timestamps; don't infer LoRa link health.
- Production hosting must fall back all routes to `index.html` (client-side routing).
