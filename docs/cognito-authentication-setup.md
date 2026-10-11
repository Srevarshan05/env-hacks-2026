# Cognito authentication setup for .env

Prepared for the existing React login/register form. This is a proposed implementation contract; Cognito resources and backend routes have not been created or connected by this frontend.

## Architecture

Keep the custom React form. Send requests to an authentication API that calls the Cognito User Pools SDK. The API creates browser sessions and stores application profiles in the existing RDS database.

```text
React frontend -> authentication API -> Cognito user pool
                            |
                            +-> RDS user profiles and server-side sessions
```

Cognito owns passwords, email confirmation, sign-in, password recovery, and token issuance. RDS holds application profile data. The browser receives a session cookie and user information; Cognito tokens and the app-client secret remain on the backend.

For the two-account arrangement, place the backend in the RDS account and VPC where practical. The backend calls Cognito's regional HTTPS API in the other account. The public `SignUp`, `ConfirmSignUp`, and `InitiateAuth` operations use an app client and its secret hash rather than IAM administration permissions. If administrative Cognito operations are later added, explicitly provision the appropriate IAM access. See [Cognito authorization models](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flows-public-server-side.html).

If the backend is placed in a separate VPC/account from RDS, configure private connectivity, routes, security groups, and database authentication. VPC peering can connect VPCs across accounts; an IAM role alone does not provide a SQL network connection. See [RDS VPC connection scenarios](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_VPC.Scenarios.html).

## Cognito settings

1. Create a **User pool**, for example `env-users`, in your chosen region. `ap-south-1` is an example, not a requirement. An Identity Pool is not needed for this design.
2. Configure email as the sign-in identifier with case-insensitive sign-in. Enable self-service sign-up. Use the standard `email` and `name` attributes; require both for this application.
3. Enable automatic email verification and send a **confirmation code**. Configure verified email as the account-recovery method. Keep newly registered users unconfirmed until they submit the emailed code. See [sign-up and confirmation](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html).
4. Proposed password policy: minimum 12 characters, with uppercase, lowercase, number, and symbol requirements. The frontend's current minimum is eight; its validation must be updated to this policy when authentication is wired. Keep MFA off for this initial email/password contract; supporting MFA later requires challenge endpoints and screens. Disable remembered devices initially.
5. Create an app client, for example `env-auth-backend`. Choose **Traditional web application**, because the backend performs authentication and keeps the generated client secret. The React app itself never receives that secret. See [app client configuration](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html).
6. In the app client's authentication flows, enable **`ALLOW_USER_PASSWORD_AUTH`** for the password-based `InitiateAuth` calls below. Enable user-existence error prevention. Give the app client read/write permission for `email` and `name`. This custom form flow uses the regional User Pools API; managed-login redirects and OAuth callback URLs are outside this implementation. See [password authentication flows](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html).
7. Suggested token lifetimes: access and ID tokens one hour; refresh token 30 days. Enable token revocation and refresh-token rotation. Use `GetTokensFromRefreshToken` when rotating tokens; disable `ALLOW_REFRESH_TOKEN_AUTH`, which is incompatible with rotation. A short retry grace period, for example ten seconds, is useful. See [refresh tokens and rotation](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html).
8. Cognito's built-in email sender can support initial development. For production email volume, configure an Amazon SES verified sending identity and obtain SES production access as needed. Configure SES in a supported region for your pool. See [Cognito email delivery](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-email.html).

## Backend configuration

The backend needs the Cognito region, user pool ID, app client ID, app client secret, RDS connection settings, and session-storage configuration. Keep secrets in backend configuration or AWS Secrets Manager. No client secret, AWS credentials, database connection string, or Cognito tokens go into `VITE_` variables.

For each API operation that requires the client secret hash, calculate it on the server:

```text
SecretHash = Base64(HMAC-SHA256(key = clientSecret, message = username + clientId))
```

Use the normalized email as the username for the sign-up and password-login requests shown here. `SignUp`, `ConfirmSignUp`, `ResendConfirmationCode`, `ForgotPassword`, and `ConfirmForgotPassword` take `SecretHash`. `InitiateAuth` takes `AuthParameters.SECRET_HASH`. `GetTokensFromRefreshToken` and `RevokeToken` take `ClientSecret` directly. See [secret hash computation](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html#cognito-user-pools-computing-secret-hash), [token refresh request](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GetTokensFromRefreshToken.html), and [token revocation request](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RevokeToken.html).

## Frontend endpoint contract

The paths below belong to your own API. You can choose different names and supply their URLs. All JSON requests use `Content-Type: application/json` and `Accept: application/json`. Responses with bodies use JSON too. The frontend sends credentials with `credentials: 'include'` so the browser handles the session cookie.

| Method and proposed route | JSON body from frontend | Backend operation | Success |
| --- | --- | --- | --- |
| POST `/auth/register` | `{ "name": "...", "email": "...", "password": "..." }` | Cognito `SignUp` | 201, confirmation required |
| POST `/auth/confirm-signup` | `{ "email": "...", "code": "123456" }` | `ConfirmSignUp` | 200, confirmed |
| POST `/auth/resend-code` | `{ "email": "..." }` | `ResendConfirmationCode` | 200, code sent |
| POST `/auth/login` | `{ "email": "...", "password": "..." }` | `InitiateAuth` with `USER_PASSWORD_AUTH`; verify identity; upsert RDS profile; create session | 200, user + session cookie |
| GET `/auth/me` | None; browser supplies cookie | Session lookup; refresh expired tokens if appropriate | 200, user; 401 if no valid session |
| POST `/auth/refresh` | None; browser supplies cookie | `GetTokensFromRefreshToken`; replace stored tokens | 200, user; 401 if session cannot be renewed |
| POST `/auth/logout` | None; browser supplies cookie | Remove server session, revoke its Cognito refresh token, clear cookie | 204, no body |
| POST `/auth/forgot-password` | `{ "email": "..." }` | `ForgotPassword` | 200, generic acknowledgment |
| POST `/auth/reset-password` | `{ "email": "...", "code": "123456", "newPassword": "..." }` | `ConfirmForgotPassword` | 200, password reset |

An explicit `/auth/refresh` route can be omitted if `/auth/me` and authenticated backend requests already refresh the server-held tokens automatically. Refresh operations must be serialized per session when rotation is enabled.

### Registration response

Return HTTP 201 after Cognito accepts sign-up. This does not create an authenticated session.

```json
{
  "status": "CONFIRMATION_REQUIRED",
  "userId": "cognito-sub-value",
  "delivery": {
    "medium": "EMAIL",
    "destination": "s***@example.com"
  }
}
```

Map `UserSub` to `userId`, and Cognito's `CodeDeliveryDetails` to the delivery object. Display only the masked destination that Cognito returns. The frontend opens an email-code step. See [SignUp response](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_SignUp.html).

### Email confirmation response

Return HTTP 200:

```json
{ "status": "CONFIRMED" }
```

The frontend then shows login. Avoid retaining the registration password across the confirmation step. Resend-code success returns `status: "CODE_SENT"` and the same delivery object as registration.

### Login, session lookup, and refresh response

Return HTTP 200:

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

The backend verifies the Cognito identity, obtains the profile, and sets an **opaque session-ID cookie** at login. Cognito's access, ID, and refresh tokens stay in the server-side session store. This response does not expose tokens to React. `id` comes from Cognito's `sub` claim, not an email address or user-provided ID. See [Cognito ID claims](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-id-token.html) and [JWT verification](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html).

Suggested production cookie:

```http
Set-Cookie: env_session=<opaque-random-session-id>; HttpOnly; Secure; SameSite=Lax; Path=/
```

Place the production frontend and API on the same site when practical. Local HTTP development needs a suitable cookie configuration and consistent host names, such as `127.0.0.1` on both ports. A cross-site deployment needs `SameSite=None; Secure` and is still subject to browser third-party-cookie restrictions. Use CSRF protection or strict Origin validation for authenticated state-changing requests. See [Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

For cross-origin requests, allow the exact frontend origin, currently `http://127.0.0.1:5173`, and `Access-Control-Allow-Credentials: true`. Allow GET/POST/OPTIONS and required headers. Do not use a wildcard allowed origin with credentials. See [credentialed CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

### Password recovery responses

For forgot-password, return HTTP 200 with the same generic response whether or not the email is registered:

```json
{ "status": "RESET_REQUESTED", "message": "If this account is eligible, a password reset code has been sent." }
```

After a valid reset code and new password, return HTTP 200:

```json
{ "status": "PASSWORD_RESET" }
```

### Error contract

Normalize Cognito exceptions into the application's HTTP status and body rather than exposing raw AWS SDK errors:

```json
{
  "error": {
    "code": "USER_UNCONFIRMED",
    "message": "Verify your email before logging in."
  }
}
```

| Application HTTP status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Missing or malformed input; optional fieldErrors |
| 400 | `INVALID_PASSWORD` | Password does not meet configured policy |
| 400 | `CODE_MISMATCH` | Incorrect verification or reset code |
| 400 | `CODE_EXPIRED` | Request another code |
| 401 | `INVALID_CREDENTIALS` | Email or password rejected; use one generic message |
| 401 | `SESSION_EXPIRED` | Login is needed again |
| 403 | `USER_UNCONFIRMED` | Show confirmation-code step |
| 409 | `EMAIL_IN_USE` | Email already registered |
| 429 | `RATE_LIMITED` | Too many requests; optional Retry-After header |
| 500 | `SERVER_ERROR` | Unexpected backend failure |
| 503 | `PROFILE_UNAVAILABLE` | RDS profile operation unavailable; login can be retried |

These are **your backend's mapped statuses**, not Cognito's raw HTTP status codes. `fieldErrors` may contain `name`, `email`, `password`, `code`, or `newPassword`. Validate on the backend, trim name/email, normalize email consistently, and preserve passwords exactly. Disable password and token logging in application and request-body logs.

## Cognito SDK request examples — backend only

Registration:

```json
{
  "ClientId": "your-app-client-id",
  "Username": "shamyukthaa@example.com",
  "Password": "user-chosen-password",
  "SecretHash": "server-calculated-hash",
  "UserAttributes": [
    { "Name": "email", "Value": "shamyukthaa@example.com" },
    { "Name": "name", "Value": "Shamyukthaa" }
  ]
}
```

Login:

```json
{
  "ClientId": "your-app-client-id",
  "AuthFlow": "USER_PASSWORD_AUTH",
  "AuthParameters": {
    "USERNAME": "shamyukthaa@example.com",
    "PASSWORD": "user-chosen-password",
    "SECRET_HASH": "server-calculated-hash"
  }
}
```

Use the returned `AuthenticationResult` to populate the server-side session. If Cognito returns a challenge instead of tokens, do not report successful login; support that challenge or return a clear handled error. This initial contract assumes self-registered, confirmed users with MFA and remembered devices disabled. See [InitiateAuth](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_InitiateAuth.html).

## RDS profile integration

At the first successful login, perform an idempotent profile upsert using verified Cognito claims. Suggested columns:

```text
cognito_issuer   text/varchar
cognito_sub      text/varchar
name            text/varchar
email           text/varchar
email_verified  boolean
created_at      timestamp
updated_at      timestamp
unique(cognito_issuer, cognito_sub)
```

Store `sub` as a string; do not impose a strict UUID format. Email can change, so it is a profile attribute rather than the identity key. No user password is stored in RDS. Use a separate session store/table with expiry and protected server-held tokens; cookie session IDs should be random and regenerated at login. Parameterize SQL. If the profile write fails, return a retryable error; retrying login should upsert the same profile rather than create a second Cognito account.

This approach avoids needing a cross-account database write from a Cognito post-confirmation trigger. The profile is created after verified login. If an RDS profile must exist immediately after email confirmation, add an idempotent post-confirmation integration and configure its cross-account networking/permissions separately.

## Details to provide for frontend integration

- Authentication API base URL and final route paths.
- AWS Cognito region, user pool ID, and app client ID (non-secret identifiers).
- Final frontend/API deployment origins and confirmation that credentialed CORS and cookies work.
- Configured password policy and confirmation-code behavior.
- Actual success/error examples matching this contract, including whether token refresh is automatic.
- For coordinating backend profile work: RDS engine and profile field names. Database credentials stay on the backend.

The frontend will then add email confirmation/resend, password recovery, session restoration, signed-in navigation, and logout. No refill or rewards requests are sent to the authentication API. Existing care credits and redemptions remain browser-local as requested.
