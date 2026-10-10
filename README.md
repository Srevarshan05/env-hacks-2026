# env-user-dashboard — Node.js, Express, PostgreSQL / AWS RDS

## 1. Requirements
Node.js 20+; PostgreSQL RDS database and app database login. Download the AWS RDS CA bundle as `global-bundle.pem` from the official AWS truststore. See https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html

## 2. Configure
Copy `.env.example` to `.env`. Set DATABASE_URL to the actual endpoint, database name and app credentials, set DB_CA_PATH to `./global-bundle.pem`, set strong JWT_SECRET and DEVICE_API_KEY. Never commit these files. For passwords containing special URL characters, URL-encode them.

If RDS is private, connect from a host in the same VPC or through a secure tunnel. Do not expose port 5432 to the entire internet.

## 3. Run
```
npm install
npm run db:init
npm run dev
```
Test `GET http://localhost:5001/api/health`.

## 4. Make initial admin safely
Register normally using `POST /api/auth/register`, then in pgAdmin Query Tool (connected to the database) run once:
```
UPDATE users SET role='admin' WHERE email='YOUR_ADMIN_EMAIL';
```
Log in again for a token containing the new admin role. Never expose an unauthenticated API endpoint for changing roles. A production deployment should use a controlled admin provisioning workflow.

## 5. Create a node
`POST /api/admin/nodes` with header `Authorization: Bearer ADMIN_TOKEN` and JSON:
```
{"id":"NODE-001","name":"Traffic Signal Node","location":"Main Road"}
```
Then open `http://localhost:5001/api/nodes/NODE-001/qr` to see its QR code. It points to `FRONTEND_URL/node/NODE-001`. You must build that frontend page separately.

## 6. User journey
- Register: `POST /api/auth/register` with `full_name`, `email`, `password`.
- Log in: `POST /api/auth/login` with `email`, `password`.
- Contribute: `POST /api/contributions`, Bearer user token, `{"node_id":"NODE-001","liters":1}`.
- Operator reviews: `POST /api/admin/contributions/CONTRIBUTION_UUID/review`, Bearer operator/admin token, `{"approve":true}`.
- View balance: `GET /api/me/points` with Bearer user token.
- Create reward: `POST /api/admin/rewards`, Bearer admin token, `{"title":"Eco Badge","points_cost":50,"stock":10}`.
- Redeem reward: `POST /api/rewards/REWARD_UUID/redeem` with Bearer user token.

## 7. Sensor readings
Send `POST /api/telemetry` with header `x-device-key: DEVICE_API_KEY` and JSON:
```
{"node_id":"NODE-001","co2_ppm":480,"so2_ppb":3.5,"pm25_ug_m3":14.7,"temperature_c":30,"humidity_pct":60,"water_level_pct":80}
```
Values above are DEMONSTRATION values, not actual measurements. `GET /api/nodes/NODE-001/readings/latest` shows the latest stored reading. Device API key is shared across devices in this starter; for deployment, implement per-device rotating credentials or AWS IoT Core authorizations.

## Important limitations
- Submitted water quantities are **self-reported** until an operator verifies them. Add sensor-based verification or signed operator QR confirmation before unattended public operation.
- 10 points per verified liter is a configurable *business rule* in this starter, currently a code constant.
- Protect endpoints against abuse: CAPTCHA/email verification, operator audit logs, water contribution limits, gateway key rotation, and stricter per-user/device rate limits before production.
- For financial-value rewards, consider dedicated fulfillment/cancellation and refund processes, and thoroughly test transactions under load.
- RDS SSL certificate verification is enabled only if `DB_CA_PATH` is configured. Configure it in production.
- `db:init` is for fresh installation. For future updates, use versioned database migrations, not repeated alterations of the schema.
