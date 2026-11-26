"""Admin use cases for review-cycle settings: read the current cycle, and
save a complete configuration by review year.

Validation mirrors the review_cycles table's check constraints with friendly
messages, but the constraints stay the last word — the service refuses early
and legibly, the DB refuses anything that slips past it. The deadline's UTC
date-part is what must not sit after the manager review start's day, because
window comparisons (like the manager's view of deadlines) are day-based.
"""

import datetime

from app.core.errors import AppError
from app.models.review_cycle import ReviewCycle
from app.repositories.review_cycle_repository import ReviewCycleRepository
from app.schemas.cycle_settings import CycleSettingsOut, CycleSettingsPut

#: Reversed here because the database's own constraints already encode every
#: one of these rules — keep both in step (schema comment on the model is the
#: cross-reference for DB-first maintenance).
ORDER_RULES: tuple[str, ...] = (
    "The submission deadline's day must come on or before the manager review start date.",
    "The manager review start date must come on or before the manager review end date.",
    "The manager review end date must come on or before the HR approval and release date.",
)


def _validate_order(settings: CycleSettingsPut) -> None:
    deadline_day = settings.submission_deadline.astimezone(datetime.timezone.utc).date()
    ordered: list[tuple[datetime.date, datetime.date]] = [
        (deadline_day, settings.manager_review_start),
        (settings.manager_review_start, settings.manager_review_end),
        (settings.manager_review_end, settings.hr_approval_release_by),
    ]
    for (earlier, later), message in zip(ordered, ORDER_RULES):
        if earlier > later:
            raise AppError(message, code="date_order_error", status_code=400)


async def get_cycle_settings(
    cycle_repository: ReviewCycleRepository,
) -> CycleSettingsOut:
    cycle = await cycle_repository.current()
    if cycle is None:
        raise AppError(
            "No review cycle is configured yet.", code="cycle_missing", status_code=404
        )
    return CycleSettingsOut(
        review_year=cycle.review_year,
        submission_deadline=cycle.submission_deadline,
        manager_review_start=cycle.manager_review_start,
        manager_review_end=cycle.manager_review_end,
        hr_approval_release_by=cycle.hr_approval_release_by,
        employee_eligibility_date=cycle.employee_eligibility_date,
    )


async def upsert_cycle_settings(
    settings: CycleSettingsPut,
    cycle_repository: ReviewCycleRepository,
) -> CycleSettingsOut:
    _validate_order(settings)
    cycle = await cycle_repository.find_by_year(settings.review_year)
    if cycle is None:
        cycle = ReviewCycle(
            review_year=settings.review_year,
            submission_deadline=settings.submission_deadline,
            manager_review_start=settings.manager_review_start,
            manager_review_end=settings.manager_review_end,
            hr_approval_release_by=settings.hr_approval_release_by,
            employee_eligibility_date=settings.employee_eligibility_date,
        )
        await cycle_repository.add(cycle)
    else:
        cycle.submission_deadline = settings.submission_deadline
        cycle.manager_review_start = settings.manager_review_start
        cycle.manager_review_end = settings.manager_review_end
        cycle.hr_approval_release_by = settings.hr_approval_release_by
        cycle.employee_eligibility_date = settings.employee_eligibility_date
    return CycleSettingsOut(
        review_year=cycle.review_year,
        submission_deadline=cycle.submission_deadline,
        manager_review_start=cycle.manager_review_start,
        manager_review_end=cycle.manager_review_end,
        hr_approval_release_by=cycle.hr_approval_release_by,
        employee_eligibility_date=cycle.employee_eligibility_date,
    )
