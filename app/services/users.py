import uuid

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import User
from app.security import COGNITO_PASSWORD_MARKER, CognitoIdentity
from app.services.errors import ServiceError


def _by_sub(db: Session, sub: str) -> User | None:
    return db.scalars(select(User).where(User.cognito_sub == sub)).first()


def get_or_create_user(db: Session, ident: CognitoIdentity) -> tuple[User, bool]:
    """Map a verified Cognito identity to its RDS users row. Returns (user, created).

    * Known Cognito user           -> existing row.
    * Pre-Cognito row, same email  -> linked, but only if Cognito says the email is verified
                                      (otherwise anyone could claim someone else's history).
    * Otherwise                    -> new row (role 'user'; promote admins in the database).
    """
    if (user := _by_sub(db, ident.sub)) is not None:
        return user, False

    existing = db.scalars(select(User).where(func.lower(User.email) == ident.email)).first()
    if existing is not None:
        if existing.cognito_sub is None and ident.email_verified:
            existing.cognito_sub = ident.sub
            db.commit()
            return existing, False
        raise ServiceError(409, "account_conflict",
                           "An account with this email already exists. Verify your email address and try again.")

    user = User(id=uuid.uuid4(), full_name=ident.name or ident.email.split("@")[0], email=ident.email,
                password_hash=COGNITO_PASSWORD_MARKER, role="user", cognito_sub=ident.sub)
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        # Two first requests raced; the unique index on cognito_sub picked the winner.
        db.rollback()
        if (user := _by_sub(db, ident.sub)) is not None:
            return user, False
        raise ServiceError(409, "account_conflict", "An account with this email already exists.")
    db.refresh(user)
    return user, True
