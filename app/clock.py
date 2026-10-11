from datetime import datetime, timezone


def utcnow() -> datetime:
    """Single time source (UTC, tz-aware). Tests monkeypatch this for deterministic timing."""
    return datetime.now(timezone.utc)
