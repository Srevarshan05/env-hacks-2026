from datetime import timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import current_user
from app.models import Contribution, Node, PointsLedger, Redemption, RefillSession, SensorReading, User
from app.schemas import session_out
from app.services.points import balance

router = APIRouter(tags=["account"])


def _approved_totals(db: Session, user: User) -> tuple[int, float]:
    count, liters = db.execute(
        select(func.count(Contribution.id), func.coalesce(func.sum(Contribution.liters), 0))
        .where(Contribution.user_id == user.id, Contribution.status == "approved")
    ).one()
    return int(count), float(liters)


@router.get("/api/me/points")
def my_points(user: User = Depends(current_user), db: Session = Depends(get_db),
              limit: int = Query(default=100, ge=1, le=500)):
    earned, spent = db.execute(
        select(
            func.coalesce(func.sum(case((PointsLedger.delta > 0, PointsLedger.delta), else_=0)), 0),
            func.coalesce(func.sum(case((PointsLedger.delta < 0, -PointsLedger.delta), else_=0)), 0),
        ).where(PointsLedger.user_id == user.id)
    ).one()
    rows = db.scalars(
        select(PointsLedger).where(PointsLedger.user_id == user.id).order_by(PointsLedger.created_at.desc()).limit(limit)
    ).all()
    return {
        "balance": int(earned) - int(spent),
        "earned": int(earned),
        "spent": int(spent),
        "ledger": [{
            "id": r.id, "delta": r.delta, "reason": r.reason, "created_at": r.created_at,
            "type": "contribution_credit" if r.contribution_id else "redemption_debit" if r.redemption_id else "adjustment",
            "contribution_id": r.contribution_id, "redemption_id": r.redemption_id,
        } for r in rows],
    }


@router.get("/api/dashboard")
def dashboard(user: User = Depends(current_user), db: Session = Depends(get_db)):
    refills, liters = _approved_totals(db, user)
    today = clock.utcnow().date()
    since = today - timedelta(days=6)
    day = func.date(func.timezone("UTC", Contribution.created_at))
    per_day = dict(db.execute(
        select(day, func.sum(Contribution.points_awarded))
        .where(Contribution.user_id == user.id, Contribution.status == "approved", day >= since)
        .group_by(day)
    ).all())
    weekly = [
        {"date": d.isoformat(), "day": d.strftime("%a"), "points": int(per_day.get(d, 0))}
        for d in (since + timedelta(days=i) for i in range(7))
    ]
    sensor = db.scalars(select(SensorReading).order_by(SensorReading.recorded_at.desc()).limit(1)).first()
    return {
        "stats": {"points": balance(db, user.id), "refills": refills, "liters": liters},
        "weekly": weekly,
        "environment": None if sensor is None else {
            "machine_id": sensor.node_id,
            "co2_ppm": float(sensor.co2_ppm) if sensor.co2_ppm is not None else None,
            "water_level_pct": float(sensor.water_level_pct) if sensor.water_level_pct is not None else None,
            "recorded_at": sensor.recorded_at,
        },
        "machine_count": db.scalar(select(func.count(Node.id)).where(Node.active.is_(True))),
    }


@router.get("/api/history")
def history(user: User = Depends(current_user), db: Session = Depends(get_db),
            limit: int = Query(default=100, ge=1, le=200)):
    contributions = db.scalars(
        select(Contribution).where(Contribution.user_id == user.id).order_by(Contribution.created_at.desc()).limit(limit)
    ).all()
    sessions = db.scalars(
        select(RefillSession).where(RefillSession.user_id == user.id).order_by(RefillSession.created_at.desc()).limit(limit)
    ).all()
    transactions = db.scalars(
        select(PointsLedger).where(PointsLedger.user_id == user.id).order_by(PointsLedger.created_at.desc()).limit(limit)
    ).all()
    redemptions = db.scalars(
        select(Redemption).where(Redemption.user_id == user.id).order_by(Redemption.created_at.desc()).limit(limit)
    ).all()
    return {
        "contributions": [{
            "id": c.id, "machine_id": c.node_id, "machine_name": c.node.name, "liters": float(c.liters),
            "status": c.status, "points_awarded": c.points_awarded, "created_at": c.created_at,
        } for c in contributions],
        "refill_sessions": [session_out(s) for s in sessions],
        "transactions": [{"id": t.id, "delta": t.delta, "reason": t.reason, "created_at": t.created_at} for t in transactions],
        "redemptions": [{
            "id": r.id, "reward_id": r.reward_id, "reward_title": r.reward.title, "points_spent": r.points_spent,
            "status": r.status, "created_at": r.created_at,
        } for r in redemptions],
    }


@router.get("/api/profile")
def profile(user: User = Depends(current_user), db: Session = Depends(get_db)):
    refills, liters = _approved_totals(db, user)
    earned = func.sum(PointsLedger.delta).label("earned")
    totals = select(PointsLedger.user_id, earned).where(PointsLedger.delta > 0).group_by(PointsLedger.user_id).subquery()
    mine = db.scalar(select(totals.c.earned).where(totals.c.user_id == user.id)) or 0
    rank = 1 + db.scalar(select(func.count()).select_from(totals).where(totals.c.earned > mine))
    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role,
                 "created_at": user.created_at},
        "stats": {"points": balance(db, user.id), "refills": refills, "liters": liters, "lifetime_points": int(mine)},
        "rank": rank,
    }
