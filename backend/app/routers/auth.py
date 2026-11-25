"""Session endpoints: the dev email login and the Entra ID SSO hand-off.

One route = one use case. The stub-identity login ("who is this email on
the roster?") stays for the dev environment; the SSO routes carry real
verification through Entra and end with the server-side session cookie —
the cookie is what get_current_user reads from then on. Every route maps
identity through the one shared authenticate_email seam, with its single
401-envelope behavior; successful SSO bounces the browser back to the SPA
so the static host (or the Vite proxy) answers the next request.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import RedirectResponse

from app.core.auth import AuthUser, authenticate_email, get_current_user
from app.core.config import Settings, get_settings
from app.core.errors import SsoError
from app.core.sessions import issue_session
from app.repositories.employee_repository import EmployeeRepository, get_employee_repository
from app.schemas.auth import SessionOut, SessionRequest
from app.services import sso as sso_service

router = APIRouter(tags=["auth"])

_SSO_STATE_COOKIE = "sso_state"


@router.post("/auth/session", response_model=SessionOut)
async def open_session(
    payload: SessionRequest,
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SessionOut:
    user = await authenticate_email(payload.email, repository, settings)
    return SessionOut(
        employee_id=user.employee_id, name=user.name, email=user.email, role=user.role
    )


@router.get("/auth/session", response_model=SessionOut)
async def read_cookie_session(
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> SessionOut:
    """Session adoption: identify the holder of the app's session cookie.

    The SPA calls this when it boots with no remembered session, so a
    completed SSO login lights up the interface without a second prompt."""
    return SessionOut(
        employee_id=user.employee_id, name=user.name, email=user.email, role=user.role
    )


@router.get("/auth/sso/login")
async def begin_sso(settings: Annotated[Settings, Depends(get_settings)]) -> Response:
    _require_sso(settings)
    state = sso_service.new_sso_state()
    redirect = RedirectResponse(
        sso_service.sso_authorize_url(settings, state), status_code=303
    )
    redirect.set_cookie(
        key=_SSO_STATE_COOKIE,
        value=state,
        max_age=sso_service.STATE_TTL_SECONDS,
        secure=settings.environment == "prod",
        samesite="lax",
        httponly=True,
    )
    return redirect


@router.get("/auth/sso/callback")
async def complete_sso(
    request: Request,
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
    code: str | None = None,
    state: str | None = None,
) -> Response:
    _require_sso(settings)
    # CSRF first: the state must pair with the HttpOnly cookie the login
    # route planted, so a forged/enemy code never navigates an innocent
    # browser into this app's session.
    sso_service.affirm_sso_state(request.cookies.get(_SSO_STATE_COOKIE, ""), state)

    id_token = await sso_service.redeem_sso_code(settings, code or "")
    email_claim = await sso_service.email_from_id_token(settings, id_token)
    user = await authenticate_email(email_claim, repository, settings)

    redirect = RedirectResponse(_app_root(settings), status_code=303)
    redirect.delete_cookie(_SSO_STATE_COOKIE)
    redirect.set_cookie(
        key=settings.session_cookie_name,
        value=issue_session(user.email, settings.session_secret),
        secure=settings.environment == "prod",
        samesite="lax",
        httponly=True,
    )
    return redirect


@router.post("/auth/logout", status_code=204)
async def close_session(
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    response = Response(status_code=204)
    response.delete_cookie(settings.session_cookie_name)
    return response


def _require_sso(settings: Settings) -> None:
    if not settings.sso_enabled:
        raise SsoError(
            "SSO is not configured for this environment.",
            code="sso_not_configured",
            status_code=501,
        )


def _app_root(settings: Settings) -> str:
    base = settings.app_url.strip().rstrip("/")
    return f"{base}/" if base != "" else "/"
