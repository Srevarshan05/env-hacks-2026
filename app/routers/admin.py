import io
import uuid

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import clock
from app.config import get_settings
from app.db import get_db
from app.deps import require_roles
from app.models import Contribution, Node, RefillSession, Reward, User
from app.routers.rewards import reward_out
from app.schemas import MachineCreateIn, MachineUpdateIn, RewardCreateIn, machine_out, parse_machine_id, session_out
from app.services import refills
from app.services.errors import ServiceError

router = APIRouter(prefix="/api/admin", tags=["admin"])
staff = require_roles("admin", "operator")
admin_only = require_roles("admin")


@router.get("/summary", dependencies=[Depends(staff)])
def summary(db: Session = Depends(get_db)):
    by_status = dict(db.execute(select(RefillSession.status, func.count()).group_by(RefillSession.status)).all())
    return {
        "counts": {
            "users": db.scalar(select(func.count(User.id))),
            "machines": db.scalar(select(func.count(Node.id)).where(Node.active.is_(True))),
            "contributions": db.scalar(select(func.count(Contribution.id))),
            "refill_sessions": by_status,
        },
        "verification_mode": get_settings().refill_verification_mode,
        "machines": [machine_out(n) for n in db.scalars(select(Node).order_by(Node.created_at.desc())).all()],
    }


@router.post("/machines", status_code=201, dependencies=[Depends(admin_only)])
def create_machine(body: MachineCreateIn, db: Session = Depends(get_db)):
    node = Node(id=parse_machine_id(body.id), name=body.name, location=body.location,
                latitude=body.latitude, longitude=body.longitude, active=True)
    db.add(node)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ServiceError(409, "machine_exists", "A machine with this id already exists.")
    db.refresh(node)
    return machine_out(node)


@router.patch("/machines/{machine_id}", dependencies=[Depends(admin_only)])
def update_machine(machine_id: str, body: MachineUpdateIn, db: Session = Depends(get_db)):
    node = db.get(Node, parse_machine_id(machine_id))
    if node is None:
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    for field, value in body.model_dump(exclude_none=True).items():
        setattr(node, field, value)
    db.commit()
    return machine_out(node)


@router.get("/machines/{machine_id}/qr", dependencies=[Depends(admin_only)])
def machine_qr(machine_id: str, db: Session = Depends(get_db)):
    """Provisioning only: SVG for the sticker. The QR merely identifies the machine."""
    node = db.get(Node, parse_machine_id(machine_id))
    if node is None:
        raise ServiceError(404, "machine_not_found", "This machine is not registered.")
    url = f"{get_settings().public_app_url}/m/{node.id}"
    buf = io.BytesIO()
    qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=20, border=2).save(buf)
    return Response(buf.getvalue(), media_type="image/svg+xml",
                    headers={"Content-Disposition": f'inline; filename="{node.id}.svg"', "X-QR-Target": url})


@router.get("/refill-sessions", dependencies=[Depends(staff)])
def list_sessions(db: Session = Depends(get_db), status: str | None = None,
                  limit: int = Query(default=100, ge=1, le=500)):
    stmt = select(RefillSession).order_by(RefillSession.created_at.desc()).limit(limit)
    if status:
        stmt = stmt.where(RefillSession.status == status)
    return [{**session_out(s), "user_id": s.user_id} for s in db.scalars(stmt).all()]


@router.post("/refill-sessions/{session_id}/cancel", dependencies=[Depends(staff)])
def cancel_session(session_id: uuid.UUID, db: Session = Depends(get_db)):
    return session_out(refills.cancel_session(db, session_id, clock.utcnow(), by_admin=True))


@router.post("/rewards", status_code=201, dependencies=[Depends(admin_only)])
def create_reward(body: RewardCreateIn, db: Session = Depends(get_db)):
    reward = Reward(id=uuid.uuid4(), active=True, **body.model_dump())
    db.add(reward)
    db.commit()
    return reward_out(reward)
