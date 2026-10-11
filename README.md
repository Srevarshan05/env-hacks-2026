# .env — environmental network web app

React + TypeScript + Vite frontend for **Thin-Film Algae-Based Air Purifier with AWS Cloud Integration**.

## Run locally

Node.js 20.19+ or 22+ is recommended. Dependencies are already installed in this workspace.

```sh
npm install
npm run dev
```

Open the Local URL Vite prints, normally **http://127.0.0.1:5173**.

```sh
npm run build    # TypeScript checks and production output in dist/
npm run preview  # Serve the production build locally
npm run test:ui  # Browser verification using installed Microsoft Edge
```

`test:ui` needs the dev server running. It saves desktop and mobile screenshots in ignored `test-results/`, tests polling and hydration, and starts its own temporary server on an available port to exercise API responses. Set `TEST_BASE_URL` to change the main preview address. Change the Playwright channel in `scripts/verify-ui.mjs` if using a different browser.

## Pages

- `/`: five scroll slides over a 2D line-art world of the thin-film algae bioreactor (`src/components/BioreactorScene.tsx`), drawn in the team-card leaf style: suction fan and fine mesh, pump and hose, inclined algae film panel, algae tank, filter column and oxygen outlet, BME680 sensor, LoRa antenna, cloud, and dashboard. The camera (`src/animation/airCamera.ts`) pans and zooms between five focus points; wheel, touch, keyboard, and slide dots advance one slide at a time with a 780 ms animation. Reduced motion shows a static story. The product section shows the unit cutaway (`public/assets/env-thin-film-unit.webp`).
- `/dashboard`: searchable node selection.
- `/dashboard/ENV-001`: latest readings, node telemetry, external map link, hydration preview, and overview chart.
- `/dashboard/ENV-001?view=analytics`: historical charts for all four BME680 measurements; 15-minute, 1-hour, and 24-hour ranges.
- `/locations`: a local SVG dotwork India map with coordinates projected onto the outline, zoom controls, searchable locations, and node detail popups. Points show the node ID and current feed status; the explicit View on map button opens Google Maps.
- `/team`: the four supplied members, botanical initial portraits, and the portfolio, GitHub, and LinkedIn links provided by the team.
- `/rewards`: plants, seed packs, and grocery vouchers, category filters, a shared browser credit balance, confirmation, and persisted redemption history.
- `/login`: Cognito login and registration (email, password, name) via AWS Amplify. Unconfirmed accounts are sent to `/verify-email`, which accepts the emailed code and can resend it. `/rewards` and recording a refill require a signed-in user; the header switches to Log out when signed in.

## Connect the read API

Create `.env.local` from `.env.example`, then restart Vite:

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
VITE_USE_SAMPLE_DATA=false
```

The base address, **provisional route templates**, ten-second polling interval, timeout, and stale threshold are centralized in `src/config/api.ts`. No read endpoint URLs were supplied, so adjust these two templates to match the future backend:

| Operation | Proposed route | Accepted response |
| --- | --- | --- |
| Latest | `GET /nodes/:nodeId/readings/latest` | One reading object, or `{ "reading": ... }` |
| History | `GET /nodes/:nodeId/readings?since=<ISO timestamp>` | An array, or `{ "readings": [...] }` |

Each reading must provide `nodeId`, `readingId`, `gasResistanceOhms`, `humidity`, `pressureHpa`, `receivedAt`, `sequence`, `temperature`, and `uptimeMs`. Numeric fields must be finite numbers; the timestamp must be parseable; the node ID must match the selected node. The adapter sorts and deduplicates history. Gas resistance is converted from Ω to kΩ for display.

The backend must allow the frontend origin via CORS. A protected dashboard authentication/read path is still to be supplied. Do not expose AWS credentials or device tokens in any Vite variable: all `VITE_` values are public browser configuration.

When demo mode is disabled, failures show an unavailable feed or preserve previously fetched readings. They never switch silently to sample data. Online/offline status comes from the reading timestamp, using a 35-second threshold. No LoRa connection health is inferred from the BME680 payload.

## Editable data and assets

- `src/data/nodes.ts`: IDs, names, coordinates, and `image` paths for node location photos stored in `public/images/nodes/`. Set `image` to null when unavailable. Missing photos use a location fallback. Credits and license links appear on the Locations page.
- `src/data/team.ts`: supplied names and nullable portfolio/GitHub/LinkedIn URLs. The supplied profile links are populated; unavailable portfolios remain null.
- `src/services/readings.ts`: sensor payload validation, read adapter, and deterministic sample feed.
- `public/assets/air-treatment-journey-v1.png`: generated connected treatment concept scene. `public/assets/oxygen-bubbles-v1.png`: generated bubble overlay. `docs/air-journey-prompts.md`: complete generation prompts. `public/assets/env-product-model.png`: unchanged supplied model image.
- `src/components/Botanical.tsx`: original botanical vector art.
- `src/styles.css`: colors, typography, responsive layout, and animation.

Refill confirmation adds 10 care credits to the shared browser wallet, with a one-hour cooldown per node. The Rewards page spends this balance and records redemptions locally. Existing per-node credits are migrated automatically. Water control, reward collection, and voucher delivery are not connected.

## Authentication

The browser talks to Cognito directly through Amplify (`src/config/amplify.js`, `src/services/authService.ts`), using `VITE_COGNITO_USER_POOL_ID` and `VITE_COGNITO_CLIENT_ID`. The app client must not have a client secret. `src/services/apiService.ts` sends the Cognito ID token as `Authorization: Bearer <token>` to the FastAPI backend at `VITE_API_BASE_URL`. Set `VITE_PROFILE_SYNC=true` once the backend is deployed: login then calls `GET /api/me`, which creates or loads the user's RDS row, and signs the user out again if that fails. The backend side is described in `docs/backend-auth-integration.md`. `docs/authentication-contract.md` and `docs/cognito-authentication-setup.md` describe an earlier backend-mediated design that was not adopted.

The UI distinguishes environmental sensing from purification performance. It does not label BME680 gas resistance as AQI, CO₂, CO, NO₂, or PM2.5, or invent carbon capture and algae-health metrics.

## Asset sources

The air-treatment scene and bubble overlay were generated with the built-in imagegen tool; the final prompts are saved in `docs/air-journey-prompts.md`. One image supplies all five camera views. The earlier waterfall asset and prompt remain in the project but are no longer used by the landing page. The botanical portraits were created for this app. The product model image was supplied by the user. All illustrations, map geometry, and font files are local at runtime.

- India outline: [Natural Earth](https://www.naturalearthdata.com/), public-domain 110m country geometry from the [Natural Earth vector repository](https://github.com/nvkelso/natural-earth-vector).
- Trichy Junction station coordinates: [OpenStreetMap via Mapcarta](https://mapcarta.com/N2669085028), 10.79427° N, 78.68529° E. This is a station location, not a surveyed device mounting position.
- Sora and Manrope: Google Fonts, SIL Open Font License. License copies are in `public/fonts/`.
- Icons: Lucide, ISC license.

Font files and license copies are already stored in `public/fonts/`. `scripts/download-fonts.mjs` is the earlier DM font download helper; `scripts/generate-assets.mjs` is the original SVG development helper. Normal development and runtime do not require these asset downloads.

## Deployment (AWS Amplify, manual zip)

Live at **https://webapp-fronted.d2g9yn1a89sqiw.amplifyapp.com** (Amplify app `d2g9yn1a89sqiw`, branch `webapp-fronted`, region `ap-south-1`). Every page route rewrites to `/index.html` (200) so deep links and QR URLs work.

```sh
npm run deploy   # build, zip dist/, upload to Amplify, wait for the result
```

Requires the AWS CLI signed in with the `AdministratorAccess-Amplify` policy and `.env.local` holding the production values (`VITE_API_URL=https://…` backend, Cognito IDs, `VITE_PROFILE_SYNC=true`), because Vite bakes `VITE_` values into the build. The backend must list the Amplify origin in its CORS allow-list.
