"""Refill session state machine.

    created ──► active ──► measuring ──► verifying ──► approved
       │          │            │             │
       └──────────┴─► expired / cancelled / failed ◄──┘

* All state lives in PostgreSQL; every transition happens under a row lock
  (SELECT ... FOR UPDATE), so any worker or API instance can safely resume a session.
* Approval inserts the contribution and the ledger credit in the SAME transaction as
  the status change. Unique constraints (refill_sessions.contribution_id,
  points_ledger.contribution_id) make a second credit impossible even under a bug.
* A session's verification_mode is fixed at creation. A session is only ever verified
  while the server runs in that same mode, so hardware mode can never fall back to
  simulator approval.
"""

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import OPEN_STATUSES, TERMINAL_STATUSES, Contribution, FlowReading, Node, PointsLedger, RefillSession
from app.services import simulator
from app.services.errors import ServiceError
from app.services.points import points_for, verified_liters_from

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "created": {"active", "cancelled", "expired", "failed"},
    "active": {"measuring", "cancelled", "expired", "failed"},
    "measuring": {"verifying", "cancelled", "failed"},
    "verifying": {"approved", "failed"},
}


class InvalidTransition(Exception):
    pass


def _transition(s: RefillSession, new: str, now: datetime, reason: str | None = None) -> None:
    if new not in ALLOWED_TRANSITIONS.get(s.status, set()):
        raise InvalidTransition(f"{s.status} -> {new}")
    s.status = new
    s.updated_at = now
    if new in TERMINAL_STATUSES:
        s.finished_at = now
    if reason:
        s.failure_reason = reason


def _lock(db: Session, session_id: uuid.UUID, skip_locked: bool = False) -> RefillSession | None:
    stmt = (
        select(RefillSession)
        .where(RefillSession.id == session_id)
        .with_for_update(of=RefillSession, skip_locked=skip_locked)
        .execution_options(populate_existing=True)
    )
    return db.scalars(stmt).first()


def _open_session(db: Session, **where) -> RefillSession | None:
    stmt = select(RefillSession).where(RefillSession.status.in_(OPEN_STATUSES))
    for col, val in where.items():
        stmt = stmt.where(getattr(RefillSession, col) == val)
    return db.scalars(stmt).first()


# ---------------------------------------------------------------------------
# Creating / cancelling (user-facing)
# ---------------------------------------------------------------------------

def get_active_machine(db: Session, machine_id: str) -> Node:
    node = db.get(Node, machine_id)
    if node is None:
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    if not node.active:
        raise ServiceError(409, "machine_inactive", "This machine is currently out of service.")
    return node


def catch_up_open_sessions(db: Session, now: datetime, *, node_id: str | None = None,
                           user_id: uuid.UUID | None = None) -> None:
    """Advance open sessions on this machine / of this user before judging them "busy".

    On serverless hosting there is no always-on worker, so a session whose user closed the
    page would otherwise keep the machine blocked until someone polled it. Advancing is
    deterministic and idempotent, so this can never add water or credit twice.
    """
    conds = [c for c in (RefillSession.node_id == node_id if node_id else None,
                         RefillSession.user_id == user_id if user_id else None) if c is not None]
    if not conds:
        return
    ids = db.scalars(select(RefillSession.id).where(RefillSession.status.in_(OPEN_STATUSES), or_(*conds))).all()
    for sid in ids:
        advance_session(db, sid, now, skip_locked=True)
    db.expire_all()


def create_session(
    db: Session, user_id: uuid.UUID, machine_id: str, idempotency_key: str | None, now: datetime
) -> tuple[RefillSession, bool]:
    """Returns (session, created). Retries and double-taps return the existing open session."""
    settings = get_settings()
    node = get_active_machine(db, machine_id)
    catch_up_open_sessions(db, now, node_id=node.id, user_id=user_id)

    def existing_or_conflict() -> RefillSession | None:
        if idempotency_key:
            prior = db.scalars(
                select(RefillSession).where(
                    RefillSession.user_id == user_id, RefillSession.idempotency_key == idempotency_key
                )
            ).first()
            if prior:
                return prior
        mine = _open_session(db, user_id=user_id)
        if mine:
            if mine.node_id == node.id:
                return mine
            raise ServiceError(409, "user_has_open_session", "You already have a refill in progress on another machine.",
                               session_id=str(mine.id), machine_id=mine.node_id)
        if _open_session(db, node_id=node.id):
            raise ServiceError(409, "machine_busy", "This machine is serving another refill. Please wait a moment.")
        return None

    if (prior := existing_or_conflict()) is not None:
        return prior, False

    s = RefillSession(
        id=uuid.uuid4(),
        user_id=user_id,
        node_id=node.id,
        status="created",
        verification_mode=settings.refill_verification_mode,
        simulator_profile=simulator.make_profile(settings) if settings.refill_verification_mode == "simulator" else None,
        measured_liters=Decimal("0"),
        idempotency_key=idempotency_key,
        created_at=now,
        updated_at=now,
    )
    db.add(s)
    try:
        db.commit()
    except IntegrityError:
        # Lost a race against a concurrent request; the partial unique indexes decided the winner.
        db.rollback()
        if (prior := existing_or_conflict()) is not None:
            return prior, False
        raise ServiceError(409, "machine_busy", "This machine is serving another refill. Please wait a moment.")
    return s, True


def cancel_session(db: Session, session_id: uuid.UUID, now: datetime, *, by_admin: bool = False,
                   user_id: uuid.UUID | None = None) -> RefillSession:
    s = _lock(db, session_id)
    if s is None or (user_id is not None and s.user_id != user_id):
        raise ServiceError(404, "session_not_found", "Refill session not found.")
    allowed = ("created", "active", "measuring") if by_admin else ("created", "active")
    if s.status not in allowed:
        db.rollback()
        raise ServiceError(409, "cannot_cancel", f"A session that is '{s.status}' cannot be cancelled.")
    _transition(s, "cancelled", now, "cancelled_by_admin" if by_admin else "cancelled_by_user")
    db.commit()
    return s


# ---------------------------------------------------------------------------
# Advancing (worker + idempotent catch-up)
# ---------------------------------------------------------------------------

def advance_session(db: Session, session_id: uuid.UUID, now: datetime, *, skip_locked: bool = True) -> RefillSession | None:
    """Move a session forward based purely on stored state and the clock. Safe to call any
    number of times from any process; returns None if another process holds the lock."""
    s = _lock(db, session_id, skip_locked=skip_locked)
    if s is None:
        db.rollback()
        return None
    if s.status in TERMINAL_STATUSES:
        db.rollback()
        return s

    if s.verification_mode != get_settings().refill_verification_mode:
        _transition(s, "failed", now, "verification_mode_mismatch")
    elif s.verification_mode == "simulator":
        _advance_simulator(db, s, now)
    else:
        _advance_hardware(s, now)
    db.commit()

    if s.status == "verifying":
        s = _lock(db, session_id)
        if s is not None and s.status == "verifying":
            verify_and_settle(db, s, now)
            db.commit()
    return s


def _advance_simulator(db: Session, s: RefillSession, now: datetime) -> None:
    profile = s.simulator_profile
    if s.status == "created":
        # The simulated machine acknowledges instantly; anchoring to created_at keeps it deterministic.
        _transition(s, "active", now)
        s.activated_at = s.created_at
    if s.status == "active":
        start = simulator.flow_start(profile, s.activated_at)
        if now < start:
            return
        _transition(s, "measuring", now)
        s.measuring_started_at = start
    if s.status == "measuring":
        for r in simulator.due_readings(profile, s.measuring_started_at, s.last_reading_seq, now):
            _store_reading(db, s, r.seq, r.cumulative_liters, "simulator", r.at)
        if s.last_reading_seq == simulator.total_ticks(profile):
            _transition(s, "verifying", now)
            s.measuring_ended_at = s.last_reading_at


def _advance_hardware(s: RefillSession, now: datetime) -> None:
    cfg = get_settings()
    if s.status == "created" and now - s.created_at > timedelta(seconds=cfg.session_activation_timeout_s):
        _transition(s, "expired", now, "machine_not_activated")
    elif s.status == "active" and now - s.activated_at > timedelta(seconds=cfg.session_flow_start_timeout_s):
        _transition(s, "expired", now, "no_flow_detected")
    elif s.status == "measuring":
        if now - s.activated_at > timedelta(seconds=cfg.session_max_duration_s):
            _transition(s, "failed", now, "max_duration_exceeded")
        elif now - s.last_reading_at > timedelta(seconds=cfg.flow_idle_timeout_s):
            _transition(s, "verifying", now)
            s.measuring_ended_at = s.last_reading_at


def _store_reading(db: Session, s: RefillSession, seq: int, liters: Decimal, source: str, measured_at: datetime,
                   received_at: datetime | None = None) -> None:
    db.add(FlowReading(session_id=s.id, seq=seq, cumulative_liters=liters, source=source, measured_at=measured_at))
    s.measured_liters = liters
    s.last_reading_seq = seq
    s.last_reading_at = received_at or measured_at
    s.updated_at = max(s.updated_at, s.last_reading_at)


# ---------------------------------------------------------------------------
# Hardware device input (REFILL_VERIFICATION_MODE=hardware)
# ---------------------------------------------------------------------------

def _device_session(db: Session, session_id: uuid.UUID, machine_id: str) -> RefillSession:
    s = _lock(db, session_id)
    if s is None or s.node_id != machine_id:
        raise ServiceError(404, "session_not_found", "No such session on this machine.")
    if s.verification_mode != "hardware" or get_settings().refill_verification_mode != "hardware":
        raise ServiceError(409, "not_hardware_session", "This session is not verified by hardware.")
    return s


def pending_session_for_machine(db: Session, machine_id: str) -> RefillSession | None:
    return _open_session(db, node_id=machine_id, status="created", verification_mode="hardware")


def activate_session(db: Session, session_id: uuid.UUID, machine_id: str, now: datetime) -> RefillSession:
    """The physical machine confirms it is armed for this session. This is the hook for a
    future proof-of-presence handshake (e.g. a code shown on the machine's display)."""
    s = _device_session(db, session_id, machine_id)
    if s.status == "active":
        db.rollback()
        return s
    if s.status != "created":
        raise ServiceError(409, "cannot_activate", f"Session is '{s.status}'.")
    _transition(s, "active", now)
    s.activated_at = now
    db.commit()
    return s


def record_device_reading(db: Session, session_id: uuid.UUID, machine_id: str, seq: int, cumulative_liters: Decimal,
                          measured_at: datetime | None, final: bool, now: datetime) -> RefillSession:
    cfg = get_settings()
    s = _device_session(db, session_id, machine_id)

    dup = db.scalars(select(FlowReading).where(FlowReading.session_id == s.id, FlowReading.seq == seq)).first()
    if dup is not None:
        db.rollback()
        if dup.cumulative_liters != cumulative_liters:
            raise ServiceError(409, "conflicting_reading", "A different value was already stored for this seq.")
        return s  # idempotent retry
    if s.status not in ("active", "measuring"):
        raise ServiceError(409, "session_not_measuring", f"Session is '{s.status}'.")
    if s.last_reading_seq is not None and seq <= s.last_reading_seq:
        raise ServiceError(409, "out_of_order_reading", "Reading seq must increase.")
    if cumulative_liters < s.measured_liters:
        raise ServiceError(422, "non_monotonic_reading", "Cumulative volume cannot decrease.")

    if s.status == "active":
        _transition(s, "measuring", now)
        s.measuring_started_at = now
    if cumulative_liters > cfg.max_session_liters:
        _transition(s, "failed", now, "volume_limit_exceeded")
        db.commit()
        return s

    # The device timestamp is kept for audit; server receive time drives timeouts.
    _store_reading(db, s, seq, cumulative_liters, "hardware", measured_at or now, received_at=now)
    if final:
        _transition(s, "verifying", now)
        s.measuring_ended_at = now
    db.commit()

    if s.status == "verifying":
        s = _lock(db, session_id)
        verify_and_settle(db, s, now)
        db.commit()
    return s


# ---------------------------------------------------------------------------
# Verification + exactly-once credit
# ---------------------------------------------------------------------------

def verify_and_settle(db: Session, s: RefillSession, now: datetime) -> None:
    """Caller holds the row lock and commits. Approves + credits, or fails, exactly once."""
    cfg = get_settings()
    if s.status != "verifying":
        raise InvalidTransition(f"cannot verify a '{s.status}' session")

    readings = db.scalars(select(FlowReading).where(FlowReading.session_id == s.id).order_by(FlowReading.seq)).all()
    reason = _verification_failure(s, readings, cfg)
    if reason:
        _transition(s, "failed", now, reason)
        return

    liters = verified_liters_from(s.measured_liters)
    points = points_for(liters)
    simulated = s.verification_mode == "simulator"

    contribution = Contribution(
        id=uuid.uuid4(), user_id=s.user_id, node_id=s.node_id, liters=liters,
        status="approved", points_awarded=points, reviewer_id=None, reviewed_at=now,
    )
    db.add(contribution)
    db.flush()
    db.add(PointsLedger(
        id=uuid.uuid4(), user_id=s.user_id, delta=points, contribution_id=contribution.id,
        reason=f"Refill at {s.node.name}" + (" [SIMULATED]" if simulated else ""),
    ))
    _transition(s, "approved", now)
    s.verified_liters = liters
    s.points_awarded = points
    s.contribution_id = contribution.id


def _verification_failure(s: RefillSession, readings: list[FlowReading], cfg) -> str | None:
    if s.verification_mode != cfg.refill_verification_mode:
        return "verification_mode_mismatch"
    if not readings:
        return "no_readings"
    if any(r.source != s.verification_mode for r in readings):
        return "reading_source_mismatch"
    if any(b.cumulative_liters < a.cumulative_liters for a, b in zip(readings, readings[1:])):
        return "non_monotonic_readings"
    if readings[-1].cumulative_liters != s.measured_liters:
        return "reading_total_mismatch"
    liters = verified_liters_from(s.measured_liters)
    if liters < cfg.min_verified_liters:
        return "volume_below_minimum"
    if liters > cfg.max_session_liters:
        return "volume_limit_exceeded"
    elapsed = max((s.measuring_ended_at - s.activated_at).total_seconds(), 1.0)
    if liters / Decimal(str(elapsed)) > cfg.max_flow_rate_lps:
        return "implausible_flow_rate"
    return None
