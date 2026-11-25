"""Entra ID (Microsoft) OIDC business layer — the IdP side of sign-in.

The service owns everything that talks to Microsoft: building the authorize
URL, exchanging the authorization code with the client secret, verifying the
returned id_token against the tenant's JWKS, and extracting the one claim
the app cares about — the email. Roster membership and roles are NOT
decided here; the callback hands the email to authenticate_email
(app/core/auth.py), the same seam the email login uses.

Secret handling: the client secret only ever goes into the token-exchange
POST body over TLS; it is never logged and never surfaces in an error.

Microsoft calls block, so each network step runs in a worker thread to keep
the event loop responsive.
"""

import asyncio
import json
import logging
import secrets
import urllib.error
import urllib.parse
import urllib.request
from typing import Final

import jwt

from app.core.config import Settings
from app.core.errors import SsoError

logger = logging.getLogger(__name__)

AUTHORITY: Final[str] = "https://login.microsoftonline.com"
SCOPE: Final[str] = "openid profile email"
STATE_TTL_SECONDS: Final[int] = 600

# Claims that may carry the sign-in address, in preference order. Entra's
# v2.0 tokens set preferred_username to the UPN; email is present when the
# directory exposes it. One must be an address for the roster mapping to work.
_EMAIL_CLAIMS: Final[tuple[str, ...]] = ("email", "preferred_username")


def _tenant(settings: Settings) -> str:
    return settings.entra_tenant_id.strip()


def sso_authorize_url(settings: Settings, state: str) -> str:
    params = urllib.parse.urlencode(
        {
            "client_id": settings.entra_client_id.strip(),
            "redirect_uri": settings.sso_redirect_uri.strip(),
            "response_type": "code",
            "response_mode": "query",
            "scope": SCOPE,
            "state": state,
        }
    )
    return f"{AUTHORITY}/{_tenant(settings)}/oauth2/v2.0/authorize?{params}"


def new_sso_state() -> str:
    return secrets.token_urlsafe(32)


def affirm_sso_state(expected: str, received: str | None) -> None:
    # CSRF guard: the browser must return the exact state value the login
    # route placed in its HttpOnly cookie — never mind whose code.
    if received is None or not secrets.compare_digest(received.strip(), expected):
        raise SsoError(
            "The sign-in could not be confirmed. Please start again.",
            code="sso_state_mismatch",
            status_code=401,
        )


async def redeem_sso_code(settings: Settings, code: str) -> str:
    """Exchange the authorization code for Microsoft's id_token string.

    The token endpoint answers JSON shaped {token_type, id_token, ...};
    anything else — HTTP error, malformed body, missing id_token — is one
    user-visible outcome, and the client secret never reaches an exception's
    rendered text.
    """
    body = urllib.parse.urlencode(
        {
            "grant_type": "authorization_code",
            "client_id": settings.entra_client_id.strip(),
            "client_secret": settings.entra_client_secret.strip(),
            "code": code.strip(),
            "redirect_uri": settings.sso_redirect_uri.strip(),
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        f"{AUTHORITY}/{_tenant(settings)}/oauth2/v2.0/token",
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    class _Rejected(Exception):
        """The token endpoint answered a diagnostic body."""

        def __init__(self, body: str) -> None:
            super().__init__("exchange rejected")
            self.body = body

    def _exchange() -> dict:
        try:
            with urllib.request.urlopen(request, timeout=STATE_TTL_SECONDS) as response:
                document = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise _Rejected(exc.read().decode("utf-8", "replace")) from None
        return document if isinstance(document, dict) else {}

    try:
        document = await asyncio.to_thread(_exchange)
    except _Rejected as exc:
        # Entra's body names the real cause (wrong secret value, redirect
        # mismatch, an already-redeemed code). Log it verbatim — it carries
        # none of our secret — while the browser keeps getting the generic
        # outcome.
        logger.warning("Entra token endpoint rejected the exchange: %s", exc.body)
        raise SsoError(
            "Sign-in with Microsoft failed. Please try again.",
            code="sso_exchange_failed",
            status_code=401,
        ) from None
    except Exception as exc:
        raise SsoError(
            "Sign-in with Microsoft failed. Please try again.",
            code="sso_exchange_failed",
            status_code=401,
        ) from exc
    id_token = document.get("id_token")
    if not isinstance(id_token, str) or id_token.strip() == "":
        raise SsoError(
            "Sign-in with Microsoft failed. Please try again.",
            code="sso_exchange_failed",
            status_code=401,
        )
    return id_token


async def email_from_id_token(settings: Settings, id_token: str) -> str:
    """Verify Microsoft's signature (RS256, tenant JWKS), issuer, and
    audience; return the sign-in email from the token's address claims."""
    try:
        jwks = jwt.PyJWKClient(f"{AUTHORITY}/{_tenant(settings)}/discovery/v2.0/keys")
        key = await asyncio.to_thread(jwks.get_signing_key_from_jwt, id_token)
        claims = jwt.decode(
            id_token,
            key.key,
            algorithms=["RS256"],
            audience=settings.entra_client_id.strip(),
            issuer=f"{AUTHORITY}/{_tenant(settings)}/v2.0",
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError as exc:
        raise SsoError(
            "The Microsoft sign-in could not be verified.",
            code="sso_failed",
            status_code=401,
        ) from exc
    return _address_from(claims)


def _address_from(claims: dict) -> str:
    for claim in _EMAIL_CLAIMS:
        value = claims.get(claim)
        if isinstance(value, str) and "@" in value:
            return value.strip().lower()
    raise SsoError(
        "Your Microsoft account did not provide an email address.",
        code="sso_no_email",
        status_code=401,
    )
