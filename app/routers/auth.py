"""Sign-up, email verification and login happen in Amazon Cognito (frontend via Amplify).

After Cognito sign-in, the frontend calls POST /api/auth/session once with the ID token.
That creates (first time) or loads the user's row in RDS and echoes the scanned machine,
so the UI can continue the QR flow to the refill page.
"""

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import cognito_identity, current_user
from app.models import Node, User
from app.schemas import machine_out, parse_machine_id, user_out
from app.security import CognitoIdentity
from app.services.errors import ServiceError
from app.services.users import get_or_create_user

router = APIRouter(tags=["auth"])


class SessionIn(BaseModel):
    machine_id: str | None = None  # QR context carried through Cognito sign-in


def machine_context(db: Session, raw: str | None) -> dict | None:
    """A stale or unknown QR never blocks sign-in; the UI decides what to show."""
    if not raw:
        return None
    try:
        node = db.get(Node, parse_machine_id(raw))
    except ServiceError:
        node = None
    if node is None:
        return {"machine_id": raw, "status": "not_found"}
    return {**machine_out(node), "status": "ok" if node.active else "inactive"}


@router.post("/api/auth/session")
def start_session(body: SessionIn | None = None, ident: CognitoIdentity = Depends(cognito_identity),
                  db: Session = Depends(get_db)):
    user, created = get_or_create_user(db, ident)
    return {"user": user_out(user), "is_new_user": created,
            "machine": machine_context(db, body.machine_id if body else None)}


@router.get("/api/auth/me")
@router.get("/api/me")
def me(user: User = Depends(current_user)):
    return {"user": user_out(user)}
