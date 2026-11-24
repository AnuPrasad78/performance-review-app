"""Admin contracts for review-cycle settings.

One payload serves the read (CycleSettingsOut) and the write (CycleSettingsPut
— every member required, so a save always writes a complete configuration).
The submission deadline is an aware datetime: the calendar carries its exact
close moment in UTC, while the window fields stay plain dates because the
manager and HR phases operate on whole days.
"""

import datetime

from pydantic import field_validator

from app.schemas.base import ApiModel


class CycleSettingsOut(ApiModel):
    review_year: int
    submission_deadline: datetime.datetime
    manager_review_start: datetime.date
    manager_review_end: datetime.date
    hr_approval_release_by: datetime.date


class CycleSettingsPut(ApiModel):
    review_year: int
    submission_deadline: datetime.datetime
    manager_review_start: datetime.date
    manager_review_end: datetime.date
    hr_approval_release_by: datetime.date

    @field_validator("submission_deadline")
    @classmethod
    def deadline_carries_an_offset(cls, value: datetime.datetime) -> datetime.datetime:
        """A bare wall time is meaningless when users span timezones: the
        client always sends an explicitly offset instant, so a naive value is
        a client bug, not something to silently reinterpret."""
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("The submission deadline must carry its UTC offset.")
        return value
