"""Session/auth contracts for the stub-identity phase.

The login surface is deliberately minimal: one email in, one identity out.
When SSO joins, the same SessionOut remains the wire contract and only the
way `role`/verification are produced changes (IdP claims, not the roster).
`role` mirrors the frontend's AuthRole spelling so its switch statement and
this contract stay letter-identical.
"""

from typing import Literal

from app.schemas.base import ApiModel


class SessionRequest(ApiModel):
    email: str


class SessionOut(ApiModel):
    employee_id: str
    name: str
    email: str
    role: Literal["admin", "employee"]
