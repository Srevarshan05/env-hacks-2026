import uuid

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import current_user
from app.models import OPEN_STATUSES, FlowReading, RefillSession, User
from app.schemas import StartRefillIn, parse_machine_id, session_out
from app.services import refills
from app.services.errors import ServiceError

router = APIRouter(prefix="/api/refill-sessions", tags=["refills"])


def _own_session(db: Session, session_id: uuid.UUID, user: User) -> RefillSession:
    s = db.get(RefillSession, session_id)
    # 404 (not 403) so other users' session ids are not even confirmed to exist.
    if s is None or s.user_id != user.id:
        raise ServiceError(404, "session_not_found", "Refill session not found.")
    return s


def _caught_up(db: Session, s: RefillSession) -> RefillSession:
    """Idempotent catch-up: progress is a function of stored state + time, never of poll
    count, so reading status cannot create water. Keeps sessions moving even if the
    background worker is paused (e.g. an idle App Runner instance)."""
    if s.status in OPEN_STATUSES:
        refills.advance_session(db, s.id, clock.utcnow(), skip_locked=True)
        db.expire_all()
        s = db.get(RefillSession, s.id)
    return s


@router.post("", status_code=201)
def start_refill(
    body: StartRefillIn,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, max_length=100),
):
    """Start Refill. The body carries only the machine id: litres and points are never accepted from clients."""
    s, created = refills.create_session(db, user.id, parse_machine_id(body.machine_id), idempotency_key, clock.utcnow())
    if not created:
        response.status_code = 200
    return session_out(s)


@router.get("")
def my_sessions(user: User = Depends(current_user), db: Session = Depends(get_db),
                limit: int = Query(default=50, ge=1, le=200)):
    rows = db.scalars(
        select(RefillSession).where(RefillSession.user_id == user.id)
        .order_by(RefillSession.created_at.desc()).limit(limit)
    ).all()
    return [session_out(s) for s in rows]


@router.get("/active")
def my_active_session(user: User = Depends(current_user), db: Session = Depends(get_db)):
    s = db.scalars(
        select(RefillSession).where(RefillSession.user_id == user.id, RefillSession.status.in_(OPEN_STATUSES))
    ).first()
    return {"session": session_out(_caught_up(db, s)) if s else None}


@router.get("/{session_id}")
def session_status(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db),
                   include_readings: bool = False):
    s = _caught_up(db, _own_session(db, session_id, user))
    out = session_out(s)
    if include_readings:
        readings = db.scalars(select(FlowReading).where(FlowReading.session_id == s.id).order_by(FlowReading.seq)).all()
        out["readings"] = [
            {"seq": r.seq, "cumulative_liters": float(r.cumulative_liters), "source": r.source, "measured_at": r.measured_at}
            for r in readings
        ]
    return out


@router.post("/{session_id}/cancel")
def cancel(session_id: uuid.UUID, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _own_session(db, session_id, user)
    return session_out(refills.cancel_session(db, session_id, clock.utcnow(), user_id=user.id))
