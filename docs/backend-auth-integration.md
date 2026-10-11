# Backend integration: Cognito tokens → FastAPI → RDS users

What the FastAPI repo needs so the frontend in this repo can switch on `VITE_PROFILE_SYNC=true`.

## Contract the frontend already uses

- Every authenticated request carries `Authorization: Bearer <Cognito ID token>`. The deployed backend requires the ID token (`token_use: id`, `aud` = app client ID), since it carries `email` and `name` (`src/services/apiService.ts`).
- After login, the frontend calls `GET {VITE_API_BASE_URL}/api/me`. The backend verifies the token, creates the user's RDS row on first call (or loads it), and returns:

```json
{ "id": 1, "cognitoSub": "uuid", "email": "user@example.com", "name": "Asha Raman", "createdAt": "2026-10-11T10:00:00Z" }
```

- Errors use FastAPI's default `{"detail": "..."}` body. The frontend shows `detail` to the user. If `/api/me` fails, the frontend signs the user out again.
- CORS must allow the frontend origin (`http://127.0.0.1:5173` in development, plus the production origin) and the `Authorization` header.

## Backend environment

```dotenv
COGNITO_REGION=ap-south-1
COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX     # same value as VITE_COGNITO_USER_POOL_ID
COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx  # same value as VITE_COGNITO_CLIENT_ID
DATABASE_URL=postgresql://<user>:<password>@<rds-endpoint>:5432/<db>
DB_SSLMODE=verify-full
DB_CA_PATH=./global-bundle.pem               # https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
CORS_ORIGINS=http://127.0.0.1:5173
```

These values belong only in the backend's git-ignored `.env` or AWS Secrets Manager. Never put them in a `VITE_` variable.

## Token verification (PyJWT)

`pip install "pyjwt[crypto]" boto3`

```python
import os
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

REGION = os.environ["COGNITO_REGION"]
POOL_ID = os.environ["COGNITO_USER_POOL_ID"]
CLIENT_ID = os.environ["COGNITO_CLIENT_ID"]
ISSUER = f"https://cognito-idp.{REGION}.amazonaws.com/{POOL_ID}"

_jwks = jwt.PyJWKClient(f"{ISSUER}/.well-known/jwks.json", cache_keys=True)
_bearer = HTTPBearer()

def access_token(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> str:
    return creds.credentials

def current_claims(token: str = Depends(access_token)) -> dict:
    try:
        key = _jwks.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER,
                            options={"require": ["exp", "iss", "sub", "token_use"]})
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Your session has expired. Please log in again.")
    # Access tokens have no `aud`; check token_use and client_id instead.
    if claims.get("token_use") != "access" or claims.get("client_id") != CLIENT_ID:
        raise HTTPException(status_code=401, detail="Invalid token.")
    return claims
```

Use `Depends(current_claims)` on every protected route. `claims["sub"]` is the stable user ID.

## `GET /api/me`

Note: the deployed backend validates the ID token instead, which already contains `email` and `name`, so it doesn't need `GetUser`. The access-token variant below is kept for reference. Access tokens don't contain `email` or `name`. On the first call, fetch them from Cognito's `GetUser`. It is authorized by the access token itself, so it needs no IAM credentials.

```python
import boto3
from botocore import UNSIGNED
from botocore.config import Config

_cognito = boto3.client("cognito-idp", region_name=REGION, config=Config(signature_version=UNSIGNED))

@app.get("/api/me")
def me(claims: dict = Depends(current_claims), token: str = Depends(access_token), db = Depends(get_db)):
    row = db.execute("SELECT id, cognito_sub, email, name, created_at FROM users WHERE cognito_sub = %s",
                     (claims["sub"],)).fetchone()
    if row is None:
        attrs = {a["Name"]: a["Value"] for a in _cognito.get_user(AccessToken=token)["UserAttributes"]}
        row = db.execute(
            """INSERT INTO users (cognito_sub, email, name) VALUES (%s, %s, %s)
               ON CONFLICT (cognito_sub) DO UPDATE SET email = EXCLUDED.email
               RETURNING id, cognito_sub, email, name, created_at""",
            (claims["sub"], attrs["email"].lower(), attrs.get("name")),
        ).fetchone()
        db.commit()
    return {"id": row[0], "cognitoSub": row[1], "email": row[2], "name": row[3],
            "createdAt": row[4].isoformat() if row[4] else None}
```

`ON CONFLICT` makes two simultaneous first logins safe. It requires a unique constraint on `cognito_sub`.

## RDS `users` table: review before changing

The column names above are a proposal. Check the existing table first:

```sql
\d users
```

The minimum this flow needs is a unique `cognito_sub` column, for example:

```sql
-- Only after reviewing existing rows and constraints:
ALTER TABLE users ADD COLUMN cognito_sub uuid UNIQUE;
```

- If the table has a `password` / `password_hash` column, make it nullable. Cognito now owns passwords and the backend must never store them.
- If users already exist with emails but no `cognito_sub`, you can link them on first login by matching the verified email (Cognito only signs in confirmed users). Do this only if those emails were trustworthy.
- Contributions and points tables should reference `users.id`, not the email, so they survive email changes.
