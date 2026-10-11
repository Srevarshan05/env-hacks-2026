import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PointsLedger, Redemption, Reward, User
from app.services.errors import ServiceError
from app.services.points import balance


def redeem(db: Session, user_id: uuid.UUID, reward_id: uuid.UUID, idempotency_key: str | None) -> tuple[Redemption, bool]:
    """Returns (redemption, replayed). Spends points exactly once per request/idempotency key."""
    # Locking the user row serialises all spending by this user, so two concurrent
    # redemptions can never both pass the balance check.
    db.execute(select(User.id).where(User.id == user_id).with_for_update())

    if idempotency_key:
        prior = db.scalars(
            select(Redemption).where(Redemption.user_id == user_id, Redemption.idempotency_key == idempotency_key)
        ).first()
        if prior:
            db.rollback()
            return prior, True

    reward = db.scalars(select(Reward).where(Reward.id == reward_id).with_for_update()).first()
    if reward is None or not reward.active:
        raise ServiceError(404, "reward_not_found", "Reward not found.")
    if reward.stock < 1:
        raise ServiceError(409, "out_of_stock", "This reward is out of stock.")
    available = balance(db, user_id)
    if available < reward.points_cost:
        raise ServiceError(409, "insufficient_points",
                           f"You need {reward.points_cost} points but have {available}.",
                           required=reward.points_cost, balance=available)

    reward.stock -= 1
    redemption = Redemption(id=uuid.uuid4(), user_id=user_id, reward_id=reward.id,
                            points_spent=reward.points_cost, status="requested", idempotency_key=idempotency_key)
    db.add(redemption)
    db.flush()
    db.add(PointsLedger(id=uuid.uuid4(), user_id=user_id, delta=-reward.points_cost,
                        reason=f"Redeemed {reward.title}", redemption_id=redemption.id))
    db.commit()
    return redemption, False
