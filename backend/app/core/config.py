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

from pydantic import Field, field_validator, model_validator
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
    # Azure Database for PostgreSQL enforces TLS: append ?ssl=require there.
    database_url: str

    # Connection pool, per process. The total a deployment can open is
    # replicas x workers x (pool_size + max_overflow); keep it under the
    # server's max_connections (docs/deployment.md has the arithmetic).
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=5, ge=0)
    # Seconds to wait for a free pooled connection before failing the request.
    db_pool_timeout: int = Field(default=10, ge=1)
    # Recycle connections before Azure's idle-connection reaping can kill them.
    db_pool_recycle: int = Field(default=1800, ge=60)

    # Stub-auth phase: header that carries the acting user until SSO arrives.
    stub_user_header: str = "X-Stub-User"

    # Entra ID (Microsoft) OIDC login. Empty defaults keep SSO disabled in dev;
    # the prod validator below refuses to boot without them — identity in prod
    # never falls back to a stub.
    entra_tenant_id: str = ""
    entra_client_id: str = ""
    entra_client_secret: str = ""
    sso_redirect_uri: str = ""

    # Where the SPA lives; the SSO callback bounces the browser here. Same
    # origin as PR_SSO_REDIRECT_URI in the Vite-proxied dev setup.
    app_url: str = "http://localhost:5173"

    # Signs the server-side session cookie (JWT). Not loaded from Entra —
    # it is this app's own credential, independent of the IdP.
    session_secret: str = ""
    session_cookie_name: str = "pr_session"

    # Stub-auth phase: emails hold the admin console role while roles live in
    # settings (user_accounts.auth_role arrives with migration A5). Env syntax:
    #   PR_STUB_ADMIN_EMAILS='["boss@emids.com"]'
    # Everyone not listed is the employee persona.
    stub_admin_emails: list[str] = []

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

    @property
    def stub_admin_emails_normalized(self) -> frozenset[str]:
        return frozenset(
            one.strip().lower()
            for one in self.stub_admin_emails
            if one.strip() != ""
        )

    @model_validator(mode="after")
    def stub_auth_only_in_dev(self) -> "Settings":
        # No secret check here is intentional: production identity comes from
        # SSO. The invariant we must hold is that the stub credential path
        # cannot be enabled where real credentials exist.
        if self.environment == "prod" and self.stub_user_header.strip() == "":
            raise ValueError("stub_user_header must be unset/empty in prod")
        return self

    @model_validator(mode="after")
    def prod_identity_comes_from_sso(self) -> "Settings":
        # A prod deploy without the Entra endpoint values or a session
        # signing key would boot into an app no one can sign into; fail the
        # boot instead of the first login.
        if self.environment != "prod":
            return self
        missing = [
            name
            for name, value in (
                ("PR_ENTRA_TENANT_ID", self.entra_tenant_id),
                ("PR_ENTRA_CLIENT_ID", self.entra_client_id),
                ("PR_ENTRA_CLIENT_SECRET", self.entra_client_secret),
                ("PR_SSO_REDIRECT_URI", self.sso_redirect_uri),
                ("PR_SESSION_SECRET", self.session_secret),
            )
            if value.strip() == ""
        ]
        if missing:
            raise ValueError("SSO is mandatory in prod; missing " + ", ".join(missing))
        return self

    @property
    def sso_enabled(self) -> bool:
        return (
            self.entra_tenant_id.strip() != ""
            and self.entra_client_id.strip() != ""
            and self.entra_client_secret.strip() != ""
            and self.sso_redirect_uri.strip() != ""
            and self.session_secret.strip() != ""
        )


@lru_cache
def get_settings() -> Settings:
    """Cached accessor — FastAPI dependencies call this per request; the cache
    turns that into one parse per process instead of one per request."""
    return Settings()
