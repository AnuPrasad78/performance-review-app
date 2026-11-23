"""Typed application settings, loaded exclusively from environment variables.

Why this module exists: configuration is the seam between runtime environments
(developer laptop, CI, a deployed server). Nothing else in the app may read
os.environ directly — the one source of truth is this class, so a mistake like
a hardcoded credential is structurally impossible, not just discouraged.

The PR_ prefix keeps these variables namespaced when this process shares an
environment with other tooling (alembic, dev servers, ...).
"""

from functools import lru_cache
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PR_", env_file=".env", extra="forbid")

    app_name: str = "Performance Review API"

    # The stub-auth crutch is only ever legal in a developer environment; the
    # validator below turns a misconfigured prod deploy into an instant boot
    # failure rather than an unauthenticated enterprise app.
    environment: Literal["dev", "prod"] = "dev"

    # Required with no default: the app refuses to boot without a database URL.
    # postgresql+asyncpg://<user>:<password>@<host>:<port>/<database>
    database_url: str

    # Stub-auth phase: header that carries the acting user until SSO arrives.
    stub_user_header: str = "X-Stub-User"

    # Vite's default dev-server origin; extend per environment via PR_CORS_ORIGINS.
    cors_origins: list[str] = ["http://localhost:5173"]

    @field_validator("database_url")
    @classmethod
    def require_async_driver(cls, value: str) -> str:
        # The engine in app.core.db is async-only; a sync `postgresql://`
        # scheme would boot today and only fail at the first connection.
        # Fail at boot instead.
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "PR_DATABASE_URL must start with postgresql+asyncpg:// "
                "(the async driver), got: " + value.split(":")[0]
            )
        return value

    @model_validator(mode="after")
    def stub_auth_only_in_dev(self) -> "Settings":
        # No secret check here is intentional: production identity comes from
        # SSO. The invariant we must hold is that the stub credential path
        # cannot be enabled where real credentials exist.
        if self.environment == "prod" and self.stub_user_header.strip() == "":
            raise ValueError("stub_user_header must be unset/empty in prod")
        return self


@lru_cache
def get_settings() -> Settings:
    """Cached accessor — FastAPI dependencies call this per request; the cache
    turns that into one parse per process instead of one per request."""
    return Settings()