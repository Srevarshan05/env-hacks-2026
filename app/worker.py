"""Refill session worker.

The job queue IS the refill_sessions table: nothing lives only in process memory.
Each pass claims open sessions one at a time with FOR UPDATE SKIP LOCKED, so several
workers (e.g. one per App Runner instance) cooperate safely, and a restarted worker
simply picks up where the last one stopped.

Run standalone:   python -m app.worker
Or in-process:    RUN_WORKER_IN_PROCESS=true (default) starts a thread in the API.
"""

import logging
import threading
from datetime import datetime

from sqlalchemy import select

from app import clock
from app.config import get_settings
from app.db import get_sessionmaker
from app.models import OPEN_STATUSES, RefillSession
from app.services.refills import advance_session

log = logging.getLogger("refill-worker")


def run_once(now: datetime | None = None, batch: int = 100) -> int:
    """Advance every open session once. Returns how many sessions were processed."""
    now = now or clock.utcnow()
    Session = get_sessionmaker()
    with Session() as db:
        ids = db.scalars(
            select(RefillSession.id).where(RefillSession.status.in_(OPEN_STATUSES))
            .order_by(RefillSession.updated_at).limit(batch)
        ).all()
    processed = 0
    for sid in ids:
        with Session() as db:
            try:
                if advance_session(db, sid, now) is not None:
                    processed += 1
            except Exception:
                db.rollback()
                log.exception("failed to advance refill session %s", sid)
    return processed


def run_forever(stop: threading.Event) -> None:
    interval = get_settings().worker_poll_s
    log.info("refill worker started (mode=%s)", get_settings().refill_verification_mode)
    while not stop.is_set():
        try:
            run_once()
        except Exception:
            log.exception("refill worker pass failed")
        stop.wait(interval)


def start_background() -> tuple[threading.Thread, threading.Event]:
    stop = threading.Event()
    t = threading.Thread(target=run_forever, args=(stop,), name="refill-worker", daemon=True)
    t.start()
    return t, stop


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    try:
        run_forever(threading.Event())
    except KeyboardInterrupt:
        pass
