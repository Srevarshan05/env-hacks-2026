# Authentication contract

The login and registration forms are ready. The backend will use AWS Cognito with the existing RDS database for profiles. Endpoint URLs have not been supplied, so the forms currently send no network requests. See [Cognito setup and full endpoint contract](cognito-authentication-setup.md) for the proposed setup, email confirmation, recovery, cross-account architecture, and SDK mappings. The matching types are in `src/types/auth.ts`.

## Requests sent by the frontend

Both operations use POST with `Content-Type: application/json` and `Accept: application/json`. Cookie-based requests will use `credentials: 'include'`.

**Register**

```json
{
  "name": "Shamyukthaa",
  "email": "shamyukthaa@example.com",
  "password": "user-entered-password"
}
```

**Login**

```json
{
  "email": "shamyukthaa@example.com",
  "password": "user-entered-password"
}
```

The frontend will trim name/email and lowercase email consistently with the Cognito pool. Passwords are preserved exactly. The proposed Cognito password policy is at least 12 characters with uppercase, lowercase, number, and symbol requirements. Current form validation uses eight characters; it will be aligned with the chosen Cognito policy when integration is implemented. The backend validates every request independently.

Only these fields are sent. Refill events, care credits, redemptions, node IDs, sensor readings, and device credentials are not part of authentication requests. Passwords are never saved to browser storage or logged.

## Successful responses

Registration: **201 Created**, with email confirmation required:

```json
{
  "status": "CONFIRMATION_REQUIRED",
  "userId": "cognito-sub-value",
  "delivery": { "medium": "EMAIL", "destination": "s***@example.com" }
}
```

The frontend submits `{ "email": "...", "code": "123456" }` to the confirmation route. HTTP 200 returns `{ "status": "CONFIRMED" }`, after which the user logs in. Registration itself does not establish an authenticated session.

Login: **200 OK**, with this body:

```json
{
  "user": {
    "id": "cognito-sub-value",
    "name": "Shamyukthaa",
    "email": "shamyukthaa@example.com",
    "emailVerified": true
  }
}
```

At login, the backend sets an opaque session-ID cookie using `Set-Cookie`. It stores Cognito tokens server-side. The user ID is the verified Cognito `sub` string. RDS profiles are upserted using the Cognito issuer and subject. No password, hash, client secret, or Cognito token is returned to React.

Recommended production session cookie: `HttpOnly; Secure; Path=/; SameSite=Lax` when the frontend and backend are on the same site. For a deployment requiring cross-site cookies, use `SameSite=None; Secure` and implement CSRF protection or strict Origin validation for state-changing endpoints. Local HTTP development needs a cookie configuration that works with the chosen local hosts. Prefer using the same host name for frontend and backend, such as `127.0.0.1` on different ports, to avoid mixing `localhost` and `127.0.0.1`.

## Error responses

Return a non-success HTTP status and this consistent shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the account details.",
    "fieldErrors": {
      "email": "Enter a valid email address.",
      "password": "Use at least 8 characters."
    }
  }
}
```

`fieldErrors` is optional. `message` should be suitable for display to the user.

| Situation | HTTP status | `error.code` | Example message |
| --- | --- | --- | --- |
| Invalid or missing input | 400 | `VALIDATION_ERROR` | Please check the account details. |
| Email already registered | 409 | `EMAIL_IN_USE` | An account already uses this email. |
| Login credentials rejected | 401 | `INVALID_CREDENTIALS` | Email or password is incorrect. |
| Too many attempts | 429 | `RATE_LIMITED` | Please wait before trying again. |
| Unexpected backend failure | 500 | `SERVER_ERROR` | We could not complete this request. |

Cognito integration additionally needs `USER_UNCONFIRMED` (403), `INVALID_PASSWORD`, `CODE_MISMATCH`, and `CODE_EXPIRED` (400), and `SESSION_EXPIRED` (401). Full mapped statuses and recovery endpoints are in the Cognito guide linked above.

Use the same invalid-credentials message whether the email or password was rejected. A 429 response may include a `Retry-After` header.

## Session restore and logout

Two companion operations are useful when the backend is ready:

- **Session lookup:** GET, no body; return 200 with the same `{ "user": ... }` body, or 401 when no valid session exists. This restores the signed-in UI after reload.
- **Logout:** POST, no JSON body; invalidate the session, clear its cookie, and return 204 with no body.

Route names remain yours to choose. These operations are proposed; the current frontend does not call them.

For a different-origin backend, allow the exact frontend origin (currently `http://127.0.0.1:5173`), send `Access-Control-Allow-Credentials: true`, and allow POST/GET/OPTIONS and the JSON content headers. A wildcard allowed origin cannot be used for credentialed requests.

## Frontend care and rewards

Hydration records, a one-hour cooldown per node, a shared credit balance, and reward redemptions remain entirely in the frontend as requested. They are saved under `env-wallet-v1` in this browser, shared across the dashboard and Rewards page. They are not tied to the authentication session or synchronized across devices. Water pump operation, plant collection, and voucher delivery are not connected. No refill or rewards endpoints are required for this implementation.

References: [Fetch credentials](https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials), [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie), [credentialed CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).
