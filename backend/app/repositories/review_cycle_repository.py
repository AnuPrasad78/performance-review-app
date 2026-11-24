"""Reads for the review_cycles table.

Only one read exists so far — "the cycle the employee answers into". Its
definition: the highest review_year configured, because cycles are created
once for a whole year and never coexist as open for answering; when a later
year's cycle is published, it *is* the current one by construction.
"""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.review_cycle import ReviewCycle


class ReviewCycleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current(self) -> ReviewCycle | None:
        statement = select(ReviewCycle).order_by(ReviewCycle.review_year.desc()).limit(1)
        return await self._session.scalar(statement)


def get_review_cycle_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[ReviewCycleRepository]:
    yield ReviewCycleRepository(session)
