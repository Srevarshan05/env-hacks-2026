import re
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models import Node, RefillSession, User
from app.services.errors import ServiceError

# Matches the live nodes_id_check constraint on RDS (relaxed from schema.sql to allow ECO-* ids).
MACHINE_ID_RE = re.compile(r"^(NODE-[0-9]{3,}|ECO-[A-Z0-9-]+)$")


def parse_machine_id(raw: str) -> str:
    """Normalise the identifier from a QR URL; unknown formats are treated as unknown machines."""
    machine_id = raw.strip().upper()
    if len(machine_id) > 64 or not MACHINE_ID_RE.match(machine_id):
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    return machine_id


# ---- requests ----------------------------------------------------------------

class StartRefillIn(BaseModel):
    model_config = ConfigDict(extra="forbid")  # a client sending "liters"/"points" gets a 422, not silent acceptance
    machine_id: str = Field(min_length=3, max_length=64)


class MachineCreateIn(BaseModel):
    id: str = Field(min_length=3, max_length=64)
    name: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=200)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class MachineUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    location: str | None = Field(default=None, min_length=2, max_length=200)
    active: bool | None = None


class RewardCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    points_cost: int = Field(gt=0, le=1_000_000)
    stock: int = Field(ge=0, le=1_000_000)


class DeviceReadingIn(BaseModel):
    seq: int = Field(ge=0, le=1_000_000)
    cumulative_liters: Decimal = Field(ge=0, le=1000, max_digits=9, decimal_places=3)
    measured_at: datetime | None = None
    final: bool = False


class TelemetryIn(BaseModel):
    node_id: str
    co2_ppm: Decimal | None = Field(default=None, ge=0, le=100000)
    so2_ppb: Decimal | None = Field(default=None, ge=0, le=100000)
    pm25_ug_m3: Decimal | None = Field(default=None, ge=0, le=10000)
    temperature_c: Decimal | None = Field(default=None, ge=-50, le=100)
    humidity_pct: Decimal | None = Field(default=None, ge=0, le=100)
    water_level_pct: Decimal | None = Field(default=None, ge=0, le=100)


# ---- response shaping --------------------------------------------------------

def user_out(u: User) -> dict:
    return {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role, "created_at": u.created_at}


def machine_out(n: Node) -> dict:
    return {"machine_id": n.id, "name": n.name, "location": n.location, "active": n.active,
            "latitude": n.latitude, "longitude": n.longitude}


def session_out(s: RefillSession) -> dict:
    approved = s.status == "approved"
    return {
        "session_id": s.id,
        "machine_id": s.node_id,
        "machine_name": s.node.name,
        "status": s.status,
        "verification_mode": s.verification_mode,
        "is_simulated": s.verification_mode == "simulator",
        "measured_liters": float(s.measured_liters),
        "verified_liters": float(s.verified_liters) if approved else None,
        "points_awarded": s.points_awarded if approved else 0,
        "failure_reason": s.failure_reason,
        "created_at": s.created_at,
        "activated_at": s.activated_at,
        "measuring_started_at": s.measuring_started_at,
        "measuring_ended_at": s.measuring_ended_at,
        "finished_at": s.finished_at,
    }
