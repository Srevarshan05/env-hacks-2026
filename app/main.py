import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app import worker
from app.config import get_settings
from app.db import get_sessionmaker, missing_schema
from app.routers import account, admin, auth, device, machines, refills, rewards
from app.services.errors import ServiceError

log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    if s.refill_verification_mode == "simulator":
        log.warning("REFILL_VERIFICATION_MODE=simulator: refills are SIMULATED, not sensor-verified.")
    stop = None
    if s.run_worker_in_process:
        _, stop = worker.start_background()
    yield
    if stop:
        stop.set()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Algae Refill Backend", version="2.0.0", lifespan=lifespan,
                  docs_url=None if s.app_env == "production" else "/docs", redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origin_list, allow_credentials=False,
                       allow_methods=["GET", "POST", "PATCH"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])

    @app.exception_handler(ServiceError)
    async def service_error(_: Request, e: ServiceError):
        return JSONResponse(status_code=e.status_code, content={"error": e.code, "message": e.message, **e.extra})

    @app.exception_handler(SQLAlchemyError)
    async def db_error(_: Request, e: SQLAlchemyError):
        log.exception("database error", exc_info=e)
        return JSONResponse(status_code=503, content={"error": "database_unavailable", "message": "Please try again shortly."})

    @app.get("/api/health", tags=["health"])
    def health():
        body = {"service": "refill-backend", "verification_mode": s.refill_verification_mode,
                "simulated_refills": s.refill_verification_mode == "simulator"}
        try:
            with get_sessionmaker()() as db:
                db.execute(text("SELECT 1"))
                missing = missing_schema(db)
        except SQLAlchemyError:
            log.exception("health check: database unreachable")
            return JSONResponse(status_code=503, content={**body, "ok": False, "database": "unreachable"})
        if missing:
            return JSONResponse(status_code=503, content={**body, "ok": False, "database": "up", "missing_schema": missing})
        return {**body, "ok": True, "database": "up"}

    for r in (auth.router, machines.router, refills.router, account.router, rewards.router, admin.router, device.router):
        app.include_router(r)
    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
app = create_app()
