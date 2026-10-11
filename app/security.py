"""Authentication: Amazon Cognito ID tokens for users, a shared key for devices.

Cognito owns sign-up, email verification, login and passwords. The frontend signs in
with Cognito (e.g. AWS Amplify) and sends the resulting ID token as
`Authorization: Bearer <id_token>`. This backend never sees a password; it only
verifies the token's signature against the user pool's public keys (JWKS).
"""

import hmac
from dataclasses import dataclass
from functools import lru_cache

import jwt
from jwt import PyJWKClient, PyJWKSet

from app.config import get_settings

# Stored in users.password_hash (NOT NULL) for Cognito-managed accounts: not a bcrypt hash,
# so it can never match any password.
COGNITO_PASSWORD_MARKER = "!cognito-managed"


@dataclass(frozen=True)
class CognitoIdentity:
    sub: str
    email: str
    email_verified: bool
    name: str


@lru_cache
def _jwks_client() -> PyJWKClient:
    # Keys are cached in-process; PyJWKClient refetches when it sees an unknown key id.
    return PyJWKClient(f"{get_settings().cognito_issuer}/.well-known/jwks.json", cache_keys=True, lifespan=3600)


@lru_cache
def _static_jwks(jwks_json: str) -> PyJWKSet:
    return PyJWKSet.from_json(jwks_json)


def _signing_key(token: str):
    jwks_json = get_settings().cognito_jwks_json
    if not jwks_json:
        return _jwks_client().get_signing_key_from_jwt(token).key
    kid = jwt.get_unverified_header(token).get("kid")
    try:
        return _static_jwks(jwks_json)[kid].key
    except KeyError:
        raise jwt.InvalidTokenError("unknown signing key id")


def verify_cognito_id_token(token: str) -> CognitoIdentity:
    """Raises jwt.PyJWTError if the token is not a valid, unexpired ID token from our user pool and app client."""
    s = get_settings()
    claims = jwt.decode(
        token,
        _signing_key(token),
        algorithms=["RS256"],
        audience=s.cognito_client_id_list,
        issuer=s.cognito_issuer,
        leeway=30,
        options={"require": ["exp", "iat", "iss", "aud", "sub", "token_use"]},
    )
    if claims["token_use"] != "id":
        raise jwt.InvalidTokenError("an ID token is required")
    email = (claims.get("email") or "").strip().lower()
    if not email:
        raise jwt.InvalidTokenError("the ID token has no email claim")
    return CognitoIdentity(
        sub=claims["sub"],
        email=email,
        email_verified=claims.get("email_verified") in (True, "true"),
        name=(claims.get("name") or "").strip(),
    )


def device_key_valid(provided: str | None) -> bool:
    expected = get_settings().device_api_key
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided.encode(), expected.encode())
