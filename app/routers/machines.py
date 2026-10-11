from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import OPEN_STATUSES, Node, RefillSession, SensorReading
from app.schemas import machine_out, parse_machine_id
from app.services.errors import ServiceError

router = APIRouter(prefix="/api/machines", tags=["machines"])


@router.get("")
def list_machines(db: Session = Depends(get_db)):
    nodes = db.scalars(select(Node).where(Node.active.is_(True)).order_by(Node.id)).all()
    return [machine_out(n) for n in nodes]


@router.get("/{machine_id}")
def get_machine(machine_id: str, db: Session = Depends(get_db)):
    """Public landing data for the QR URL /m/{machine_id}. Reveals nothing about who is using it."""
    node = db.get(Node, parse_machine_id(machine_id))
    if node is None:
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    busy = db.scalar(
        select(RefillSession.id).where(RefillSession.node_id == node.id, RefillSession.status.in_(OPEN_STATUSES))
    ) is not None
    return {**machine_out(node), "available": node.active and not busy}


@router.get("/{machine_id}/readings/latest")
def latest_reading(machine_id: str, db: Session = Depends(get_db)):
    mid = parse_machine_id(machine_id)
    r = db.scalars(
        select(SensorReading).where(SensorReading.node_id == mid).order_by(SensorReading.recorded_at.desc()).limit(1)
    ).first()
    if r is None:
        return {"machine_id": mid, "reading": None}
    fields = ("co2_ppm", "so2_ppb", "pm25_ug_m3", "temperature_c", "humidity_pct", "water_level_pct")
    return {"machine_id": mid, "reading": {
        **{f: (float(v) if (v := getattr(r, f)) is not None else None) for f in fields},
        "recorded_at": r.recorded_at,
    }}
