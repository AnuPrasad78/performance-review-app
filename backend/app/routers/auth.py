"""Session endpoint for the stub-identity login surface.

One route = one use case: "who is this email on the roster?". Auth is
deliberately absent here — login is the act of acquiring an identity — and
the shared password is ignored until SSO carries verification; the field
stays in the form so the IdP hand-off changes nothing visible.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import authenticate_email
from app.core.config import Settings, get_settings
from app.repositories.employee_repository import EmployeeRepository, get_employee_repository
from app.schemas.auth import SessionOut, SessionRequest

router = APIRouter(tags=["auth"])


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
