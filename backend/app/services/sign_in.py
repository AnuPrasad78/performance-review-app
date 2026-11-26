"""The email-and-password form's sign-in decision.

Three regimes, chosen by settings alone:
- a provision password is configured: the typed password must match it,
  then the address resolves through the shared authenticate_email seam;
- dev without one: the address alone is trusted (developer machines);
- prod without one: the form is closed and Entra SSO is the only way in.

A wrong password fails with one generic envelope before the roster is
consulted, so the form never reveals which addresses are on it.
"""

import hmac

from app.core.auth import AuthUser, authenticate_email
from app.core.config import Settings
from app.core.errors import AppError
from app.repositories.employee_repository import EmployeeRepository


async def sign_in_with_form(
    email: str,
    password: str,
    repository: EmployeeRepository,
    settings: Settings,
) -> AuthUser:
    if settings.password_sign_in_enabled:
        if not _matches(password, settings.provision_password):
            raise AppError(
                "The email or password is incorrect.",
                code="auth_invalid_credentials",
                status_code=401,
            )
        return await authenticate_email(email, repository, settings)
    if settings.email_only_sign_in:
        return await authenticate_email(email, repository, settings)
    raise AppError(
        "Sign in with Emids SSO.",
        code="auth_sso_required",
        status_code=401,
    )


def _matches(candidate: str, expected: str) -> bool:
    # Constant-time: response timing must not reveal how much of the
    # password a guess got right.
    return hmac.compare_digest(candidate.encode(), expected.strip().encode())
