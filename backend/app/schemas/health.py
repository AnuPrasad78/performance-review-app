"""Probe contracts: the readiness answer names both schema revisions so an
operator reading a probe response sees exactly which side is behind."""

from typing import Literal

from app.schemas.base import ApiModel


class ReadinessOut(ApiModel):
    status: Literal["ready"]
    schema_revision: str
    code_revision: str
