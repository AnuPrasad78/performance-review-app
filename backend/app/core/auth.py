"""The acting-employee dependency — the app's identity seam.

Today, identity arrives on the stub header carried by the frontend (name
configured in Settings, default X-Stub-User) and is resolved against the
employee roster. When SSO lands, only the lookup inside get_current_user
swaps — to the server-side session cookie — while every dependent keeps
consuming AuthUser unchanged. That single seam is why the login contract
below never needed a preview redesign.

authenticate_email is also called by the login route itself, without the
header, so login and every protected endpoint produce identities through one
shared path (including one shared 401 envelope).

get_admin_user stacks on top of it: the role lives in settings until
migration A5 (user_accounts.auth_role), and this dependency is the single
place every admin-gated route inherits that gate from. Changing where roles
come from later means editing this file, not every route. An allow-list
admin without a roster row still signs in (with an empty employee_id); the
employee-only endpoints pick up get_roster_user, which rejects that shape.
"""

import re
from dataclasses import dataclass
from typing import Annotated, Literal

from fastapi import Depends, Request

from app.core.config import Settings, get_settings
from app.core.errors import AppError
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository, get_employee_repository

AuthRole = Literal["admin", "employee"]


@dataclass(frozen=True)
class AuthUser:
    employee_id: str
    name: str
    email: str
    role: AuthRole


def role_for_email(email: str, settings: Settings) -> AuthRole:
    # RBAC lives in settings until migration A5 adds user_accounts.auth_role:
    # the admin allow-list stays configuration, never a column nobody owns.
    normalized = email.strip().lower()
    if normalized in settings.stub_admin_emails_normalized:
        return "admin"
    return "employee"


def _unauthorized(detail: str, code: str) -> AppError:
    return AppError(detail, code=code, status_code=401)


def admin_display_name(address: str) -> str:
    # Off-roster admins have no roster row to carry a name; the address
    # itself is the only truthful source, so it is shaped for the avatar.
    local = address.split("@", 1)[0]
    words = [word.capitalize() for word in re.split(r"[._+\-]", local) if word]
    return " ".join(words) or address


async def authenticate_email(
    email: str,
    repository: EmployeeRepository,
    settings: Settings,
) -> AuthUser:
    address = email.strip().lower()
    admin = role_for_email(address, settings) == "admin"

    employee: Employee | None = await repository.get_by_email(address)
    if employee is not None and employee.email:
        return AuthUser(
            employee_id=employee.employee_id,
            name=employee.employee_name,
            email=employee.email,
            role=role_for_email(employee.email, settings),
        )
    if admin:
        # Console access is configuration, not roster membership: HR admins
        # review the roster, so it cannot be the gate for them. employee_id
        # stays empty — there is no roster row to act on behalf of.
        return AuthUser(
            employee_id="",
            name=admin_display_name(address),
            email=address,
            role="admin",
        )
    raise _unauthorized(
        "This address is not on the review roster.", "auth_unknown_email"
    )


async def get_current_user(
    request: Request,
    repository: Annotated[EmployeeRepository, Depends(get_employee_repository)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthUser:
    identity = request.headers.get(settings.stub_user_header, "").strip()
    if not identity:
        raise _unauthorized("Sign in to see your review.", "auth_required")
    return await authenticate_email(identity, repository, settings)


async def get_roster_user(
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if user.employee_id == "":
        raise AppError(
            "Your sign-in is not linked to a review roster entry.",
            code="roster_required",
            status_code=403,
        )
    return user


async def get_admin_user(
    user: Annotated[AuthUser, Depends(get_current_user)],
) -> AuthUser:
    if user.role != "admin":
        raise AppError(
            "The review console is for HR administrators.",
            code="admin_required",
            status_code=403,
        )
    return user
