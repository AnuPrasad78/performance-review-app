"""Admin endpoints for review-cycle settings.

Both routes authenticate through get_admin_user (role gate in core/auth.py
stacked on the stub identity). Routers stay thin by rule: the use cases —
read and upsert — live in the service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import AuthUser, get_admin_user
from app.repositories.review_cycle_repository import (
    ReviewCycleRepository,
    get_review_cycle_repository,
)
from app.schemas.cycle_settings import CycleSettingsOut, CycleSettingsPut
from app.services.cycle_settings import get_cycle_settings, upsert_cycle_settings

router = APIRouter(tags=["cycle-settings"])


@router.get("/cycle-settings", response_model=CycleSettingsOut)
async def read_cycle_settings(
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    cycle_repository: Annotated[
        ReviewCycleRepository, Depends(get_review_cycle_repository)
    ],
) -> CycleSettingsOut:
    return await get_cycle_settings(cycle_repository)


@router.put("/cycle-settings", response_model=CycleSettingsOut)
async def save_cycle_settings(
    settings: CycleSettingsPut,
    _admin: Annotated[AuthUser, Depends(get_admin_user)],
    cycle_repository: Annotated[
        ReviewCycleRepository, Depends(get_review_cycle_repository)
    ],
) -> CycleSettingsOut:
    return await upsert_cycle_settings(settings, cycle_repository)
