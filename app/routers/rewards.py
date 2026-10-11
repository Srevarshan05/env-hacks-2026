import uuid

from fastapi import APIRouter, Depends, Header, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import Reward, User
from app.services import rewards
from app.services.points import balance

router = APIRouter(prefix="/api/rewards", tags=["rewards"])


def reward_out(r: Reward) -> dict:
    return {"id": r.id, "title": r.title, "description": r.description, "points_cost": r.points_cost,
            "stock": r.stock, "active": r.active}


@router.get("")
def list_rewards(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Reward).where(Reward.active.is_(True)).order_by(Reward.points_cost)).all()
    return {"points": balance(db, user.id), "rewards": [reward_out(r) for r in rows]}


@router.post("/{reward_id}/redeem", status_code=201)
def redeem(
    reward_id: uuid.UUID,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
    idempotency_key: str | None = Header(default=None, max_length=100),
):
    """Send an Idempotency-Key header so a retried request can never spend points twice."""
    redemption, replayed = rewards.redeem(db, user.id, reward_id, idempotency_key)
    if replayed:
        response.status_code = 200
    return {
        "redemption_id": redemption.id,
        "reward_id": redemption.reward_id,
        "reward_title": redemption.reward.title,
        "points_spent": redemption.points_spent,
        "status": redemption.status,
        "created_at": redemption.created_at,
        "balance": balance(db, user.id),
        "replayed": replayed,
    }
