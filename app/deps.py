import logging

import jwt
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.security import CognitoIdentity, device_key_valid, verify_cognito_id_token
from app.services.errors import ServiceError
from app.services.users import get_or_create_user

log = logging.getLogger("auth")
bearer = HTTPBearer(auto_error=False)


def cognito_identity(creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> CognitoIdentity:
    if creds is None:
        raise ServiceError(401, "auth_required", "Authentication required.")
    try:
        return verify_cognito_id_token(creds.credentials)
    except jwt.PyJWTError as e:
        log.warning("rejected token: %s: %s %s", type(e).__name__, e, _token_hints(creds.credentials))
        raise ServiceError(401, "invalid_token", "Session expired or invalid. Please log in again.")


def _token_hints(token: str) -> dict:
    """Non-secret claims for diagnosing rejected tokens (never logs the token or the email)."""
    try:
        claims = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        return {"decodable": False}
    return {k: claims.get(k) for k in ("token_use", "aud", "client_id", "iss", "exp")}


def current_user(ident: CognitoIdentity = Depends(cognito_identity), db: Session = Depends(get_db)) -> User:
    # Role comes from the database row, so promotions/demotions apply immediately.
    user, _ = get_or_create_user(db, ident)
    return user


def require_roles(*roles: str):
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise ServiceError(403, "forbidden", "Insufficient permissions.")
        return user

    return check


def require_device(x_device_key: str | None = Header(default=None)) -> None:
    if not device_key_valid(x_device_key):
        raise ServiceError(401, "invalid_device_key", "Device authentication failed.")
