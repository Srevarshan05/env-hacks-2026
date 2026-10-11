from decimal import Decimal
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (or a local, git-ignored .env)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"

    # --- Database -----------------------------------------------------------
    # Either DATABASE_URL, or the discrete DB_* variables (handy with AWS Secrets Manager).
    database_url: str | None = None
    db_host: str | None = None
    db_port: int = 5432
    db_name: str | None = None
    db_user: str | None = None
    db_password: str | None = None
    db_sslmode: Literal["disable", "require", "verify-ca", "verify-full"] = "verify-full"
    db_ca_path: str | None = "global-bundle.pem"
    db_pool_size: int = 5

    # --- Auth (Amazon Cognito user pool) --------------------------------------
    cognito_region: str = "ap-south-1"
    cognito_user_pool_id: str = Field(pattern=r"^[a-z]{2}-[a-z]+-\d_[0-9A-Za-z]+$")
    cognito_app_client_ids: str = Field(min_length=1)  # comma-separated if several app clients
    # Optional: paste the pool's public JWKS ({issuer}/.well-known/jwks.json) to verify tokens
    # without outbound internet (e.g. App Runner behind a VPC connector with no NAT gateway).
    cognito_jwks_json: str | None = None

    # --- Refill verification ------------------------------------------------
    refill_verification_mode: Literal["simulator", "hardware"] = "simulator"
    points_per_liter: Decimal = Decimal("1")  # 1 verified litre = 1 point
    min_verified_liters: Decimal = Decimal("1.00")  # below this a refill would earn 0 points
    max_session_liters: Decimal = Decimal("20")  # contributions.liters is capped at 100 by the schema
    max_flow_rate_lps: Decimal = Decimal("1.0")  # plausibility bound for average flow

    session_activation_timeout_s: int = 60  # created  -> expired if the machine never activates
    session_flow_start_timeout_s: int = 120  # active   -> expired if no water ever flows
    flow_idle_timeout_s: int = 8  # measuring -> verifying when readings stop (hardware)
    session_max_duration_s: int = 600  # hardware sessions running longer than this fail

    # Deterministic simulator (demo only). Defaults reproduce 0.25 L/s for 5 s = 1.25 L.
    simulator_start_delay_s: int = 2
    simulator_tick_s: int = 1
    simulator_flow_lps: Decimal = Decimal("0.25")
    simulator_duration_s: int = 5

    run_worker_in_process: bool = True
    worker_poll_s: float = 1.0

    # --- HTTP / devices -----------------------------------------------------
    cors_origins: str = "http://localhost:5173"
    public_app_url: str = "http://localhost:5173"  # QR stickers encode {public_app_url}/m/{machine_id}
    device_api_key: str | None = None

    @field_validator("public_app_url")
    @classmethod
    def _strip_slash(cls, v: str) -> str:
        return v.rstrip("/")

    @model_validator(mode="after")
    def _check(self) -> "Settings":
        if not self.database_url and not (self.db_host and self.db_name and self.db_user):
            raise ValueError("Set DATABASE_URL or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD")
        if self.max_session_liters > 100:
            raise ValueError("MAX_SESSION_LITERS cannot exceed 100 (contributions.liters constraint)")
        if self.min_verified_liters * self.points_per_liter < 1:
            raise ValueError("MIN_VERIFIED_LITERS must be worth at least 1 point")
        if self.app_env == "production":
            if self.db_sslmode != "verify-full":
                raise ValueError("Production requires DB_SSLMODE=verify-full")
            if not self.device_api_key or len(self.device_api_key) < 32:
                raise ValueError("Production requires DEVICE_API_KEY (32+ chars)")
        return self

    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"

    @property
    def cognito_client_id_list(self) -> list[str]:
        return [c.strip() for c in self.cognito_app_client_ids.split(",") if c.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
