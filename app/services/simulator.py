"""Deterministic flow-sensor simulator (REFILL_VERIFICATION_MODE=simulator only).

Readings are a pure function of the session's frozen profile and its scheduled start
time, so a worker that restarts (or a different App Runner instance) regenerates
exactly the same readings. Polling the status endpoint can never add extra water.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from decimal import Decimal

from app.config import Settings


@dataclass(frozen=True)
class ScheduledReading:
    seq: int
    at: datetime
    cumulative_liters: Decimal


def make_profile(s: Settings) -> dict:
    return {
        "start_delay_s": s.simulator_start_delay_s,
        "tick_s": s.simulator_tick_s,
        "flow_lps": str(s.simulator_flow_lps),
        "duration_s": s.simulator_duration_s,
    }


def total_ticks(profile: dict) -> int:
    return profile["duration_s"] // profile["tick_s"]


def flow_start(profile: dict, activated_at: datetime) -> datetime:
    return activated_at + timedelta(seconds=profile["start_delay_s"])


def reading_at(profile: dict, measuring_started_at: datetime, seq: int) -> ScheduledReading:
    tick = profile["tick_s"]
    liters = Decimal(profile["flow_lps"]) * tick * seq
    return ScheduledReading(seq, measuring_started_at + timedelta(seconds=tick * seq), liters)


def due_readings(profile: dict, measuring_started_at: datetime, after_seq: int | None, now: datetime) -> list[ScheduledReading]:
    """Readings with seq > after_seq whose scheduled time has passed (seq 0 = 0.00 L at flow start)."""
    first = 0 if after_seq is None else after_seq + 1
    out = []
    for seq in range(first, total_ticks(profile) + 1):
        r = reading_at(profile, measuring_started_at, seq)
        if r.at > now:
            break
        out.append(r)
    return out
