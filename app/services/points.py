import uuid
from decimal import ROUND_DOWN, ROUND_FLOOR, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import PointsLedger

LITER_QUANTUM = Decimal("0.01")  # contributions.liters is NUMERIC(9,2)


def verified_liters_from(measured: Decimal) -> Decimal:
    """Truncate the sensor total to 0.01 L. Rounding DOWN never credits water that wasn't measured."""
    return Decimal(measured).quantize(LITER_QUANTUM, rounding=ROUND_DOWN)


def points_for(verified_liters: Decimal) -> int:
    """Business rule: floor(verified litres x POINTS_PER_LITER). At 1 point/L: 1.25 L -> 1 point."""
    raw = Decimal(verified_liters) * get_settings().points_per_liter
    return int(raw.to_integral_value(rounding=ROUND_FLOOR))


def balance(db: Session, user_id: uuid.UUID) -> int:
    """The ledger is the only source of truth for a balance."""
    return int(db.scalar(select(func.coalesce(func.sum(PointsLedger.delta), 0)).where(PointsLedger.user_id == user_id)))
