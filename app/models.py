"""ORM models mapped onto the EXISTING tables (sql/schema.sql + migration_001) and the
migration_002 tables. These models never create or alter tables themselves."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, DateTime, Float, ForeignKey, Integer, Numeric, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.sql import func

OPEN_STATUSES = ("created", "active", "measuring", "verifying")
TERMINAL_STATUSES = ("approved", "failed", "cancelled", "expired")


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _created_at() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class User(Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = _uuid_pk()
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="user")  # user|admin|operator
    cognito_sub: Mapped[str | None] = mapped_column(Text, unique=True)  # added by migration_003
    created_at: Mapped[datetime] = _created_at()


class Node(Base):
    """A physical machine. `id` is the identifier printed in the QR sticker (e.g. NODE-001)."""

    __tablename__ = "nodes"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = _created_at()


class Contribution(Base):
    """An approved (or legacy pending/rejected) water contribution."""

    __tablename__ = "contributions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), nullable=False)
    liters: Mapped[Decimal] = mapped_column(Numeric(9, 2), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    points_awarded: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reviewer_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = _created_at()
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    node: Mapped[Node] = relationship(lazy="joined", innerjoin=True)


class PointsLedger(Base):
    __tablename__ = "points_ledger"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    contribution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contributions.id"), unique=True)
    redemption_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("redemptions.id"), unique=True)
    created_at: Mapped[datetime] = _created_at()


class Reward(Base):
    __tablename__ = "rewards"
    id: Mapped[uuid.UUID] = _uuid_pk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)  # added by migration_001
    points_cost: Mapped[int] = mapped_column(Integer, nullable=False)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = _created_at()


class Redemption(Base):
    __tablename__ = "redemptions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    reward_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rewards.id"), nullable=False)
    points_spent: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="requested")
    idempotency_key: Mapped[str | None] = mapped_column(Text)  # added by migration_002
    created_at: Mapped[datetime] = _created_at()

    reward: Mapped[Reward] = relationship(lazy="joined", innerjoin=True)


class SensorReading(Base):
    __tablename__ = "sensor_readings"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), nullable=False)
    co2_ppm: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    so2_ppb: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    pm25_ug_m3: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    temperature_c: Mapped[Decimal | None] = mapped_column(Numeric(7, 2))
    humidity_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    water_level_pct: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RefillSession(Base):
    """migration_002. One user + one machine + one physical measurement."""

    __tablename__ = "refill_sessions"
    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False)
    node_id: Mapped[str] = mapped_column(ForeignKey("nodes.id"), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="created")
    verification_mode: Mapped[str] = mapped_column(Text, nullable=False)
    simulator_profile: Mapped[dict | None] = mapped_column(JSONB)
    measured_liters: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False, default=Decimal("0"))
    last_reading_seq: Mapped[int | None] = mapped_column(Integer)
    last_reading_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_liters: Mapped[Decimal | None] = mapped_column(Numeric(9, 2))
    points_awarded: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    contribution_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("contributions.id"), unique=True)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    measuring_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    measuring_ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    node: Mapped[Node] = relationship(lazy="joined", innerjoin=True)


class FlowReading(Base):
    """migration_002. Cumulative volume reported by the flow sensor (or the simulator)."""

    __tablename__ = "flow_readings"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("refill_sessions.id"), nullable=False)
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    cumulative_liters: Mapped[Decimal] = mapped_column(Numeric(9, 3), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
