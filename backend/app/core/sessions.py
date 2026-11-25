"""The signed session cookie — the app's own post-SSO credential.

Entra establishes who signed in once; every later request carries this
HS256 JWT instead of re-trusting the IdP. The token holds only the email:
roles, roster membership, and employee identity stay decisions of
authenticate_email (app/core/auth.py), so the cookie can never smuggle a
role or an employee_id past them.
"""

from datetime import UTC, datetime, timedelta
from typing import Final

import jwt

SESSION_TTL_SECONDS: Final[int] = 12 * 60 * 60


def issue_session(email: str, session_secret: str) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": email.strip().lower(),
            "type": "session",
            "iat": now,
            "exp": now + timedelta(seconds=SESSION_TTL_SECONDS),
        },
        session_secret,
        algorithm="HS256",
    )


def read_session(token: str, session_secret: str) -> str | None:
    """The signed-in email, or None when the token is missing/invalid/expired.

    Untrusted input — never raises. Expired tokens count as unsigned-out.
    """
    try:
        claims = jwt.decode(
            token.strip(),
            session_secret,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    if claims.get("type") != "session":
        return None
    email = claims.get("sub")
    if not isinstance(email, str) or email.strip() == "":
        return None
    return email
