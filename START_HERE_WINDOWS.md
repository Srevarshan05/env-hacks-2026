# env-user-dashboard — Windows setup

## 1. Open in VS Code
Extract the ZIP, then open the `env-user-dashboard` folder in VS Code.

## 2. Install packages
```powershell
node -v
npm install
Copy-Item .env.example .env
```
Node.js 20+ is recommended.

## 3. Configure secrets and PostgreSQL
Edit `.env` with your RDS endpoint, PostgreSQL database username/password, a random JWT_SECRET (32+ characters), and a separate random DEVICE_API_KEY. Do not commit `.env`.

If your database password contains URL-special characters, percent-encode it in DATABASE_URL. Specify your RDS database name in DATABASE_URL before running migrations.

Download AWS RDS CA bundle from https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem and place it in the project root. Keep DB_CA_PATH=./global-bundle.pem for verified TLS.

## 4. Fix network access first
If PowerShell `Test-NetConnection <RDS-ENDPOINT> -Port 5432` returns False, the Node.js backend running on this laptop will also be unable to reach RDS. Check DNS, VPC routing, security groups and the RDS subnet group. Prefer a private RDS and a backend hosted inside the VPC for production. Do not open port 5432 to 0.0.0.0/0.

## 5. Create database
Connect to the initial `postgres` database with pgAdmin or psql and ensure your target database exists once. This is separate from the RDS instance identifier `hackathon-rdb`.

## 6. Create tables and start API
```powershell
npm run db:init
npm run dev
```
Open http://localhost:5001/api/health . The health route checks the DB and will fail if PostgreSQL is unreachable.

## 7. Test registration (PowerShell)
```powershell
$body = @{ full_name='Test User'; email='testuser@example.com'; password='StrongPass123!' } | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:5001/api/auth/register' -Method Post -ContentType 'application/json' -Body $body
```

## 8. Register first admin (development only)
After registering your own user, in pgAdmin run:
```sql
UPDATE users SET role='admin' WHERE email='YOUR_OWN_EMAIL';
```
Log in again to receive a fresh admin JWT. Do not expose this SQL operation through a public endpoint.

## 9. API routes
See README.md for full route list and example request bodies. Contribution points are awarded only after admin/operator approval; QR scans alone never award points.

## Notes
This is a hackathon starter, not a complete production deployment. Before public launch, add per-device credentials, contribution verification hardware or signed proofs, abuse prevention, audit logs, automated tests, migrations, and monitoring. The QR target requires a separate frontend route `/node/:id`.
