"""Machine-to-server API for the future ESP32 / Raspberry Pi flow-sensor controller.

All calls require the X-Device-Key header. These endpoints only do anything in
REFILL_VERIFICATION_MODE=hardware; simulator sessions are rejected.

Expected device loop:
  1. GET  /api/device/machines/{id}/pending-session        (poll for a user's Start Refill)
  2. POST /api/device/machines/{id}/sessions/{sid}/activate (machine armed: valve/LED on)
  3. POST /api/device/machines/{id}/sessions/{sid}/readings {seq, cumulative_liters} every ~1 s
  4. last reading with "final": true (or stop sending; the server ends it after FLOW_IDLE_TIMEOUT_S)
"""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import clock
from app.db import get_db
from app.deps import require_device
from app.models import Node, SensorReading
from app.schemas import DeviceReadingIn, TelemetryIn, parse_machine_id
from app.services import refills
from app.services.errors import ServiceError

router = APIRouter(prefix="/api/device", tags=["device"], dependencies=[Depends(require_device)])


def _device_view(s) -> dict:
    # Devices get the minimum they need; never user details.
    return {"session_id": s.id, "machine_id": s.node_id, "status": s.status,
            "measured_liters": float(s.measured_liters), "last_seq": s.last_reading_seq}


@router.get("/machines/{machine_id}/pending-session")
def pending_session(machine_id: str, db: Session = Depends(get_db)):
    s = refills.pending_session_for_machine(db, parse_machine_id(machine_id))
    return {"session": _device_view(s) if s else None}


@router.post("/machines/{machine_id}/sessions/{session_id}/activate")
def activate(machine_id: str, session_id: uuid.UUID, db: Session = Depends(get_db)):
    return _device_view(refills.activate_session(db, session_id, parse_machine_id(machine_id), clock.utcnow()))


@router.post("/machines/{machine_id}/sessions/{session_id}/readings")
def reading(machine_id: str, session_id: uuid.UUID, body: DeviceReadingIn, db: Session = Depends(get_db)):
    s = refills.record_device_reading(db, session_id, parse_machine_id(machine_id), body.seq,
                                      body.cumulative_liters, body.measured_at, body.final, clock.utcnow())
    return _device_view(s)


@router.post("/telemetry", status_code=201)
def telemetry(body: TelemetryIn, db: Session = Depends(get_db)):
    node_id = parse_machine_id(body.node_id)
    if db.get(Node, node_id) is None:
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    r = SensorReading(**{**body.model_dump(), "node_id": node_id})
    db.add(r)
    db.commit()
    return {"id": r.id, "machine_id": node_id}
