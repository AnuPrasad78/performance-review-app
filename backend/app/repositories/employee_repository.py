"""Reads and writes for the employees table.

Owed by the DAL contract: every query the app runs against employees lives
here; services describe *what* should happen, not how rows are fetched. The
session commits at request end (core/db.py), so flushes — not commits — keep
query results and constraint checks visible within the unit of work.
Pagination and the admin board's roster × evaluation join are reads served
here so no list endpoint ever materializes the full table.
"""

from collections.abc import AsyncIterator, Sequence
from typing import Annotated, NamedTuple

from fastapi import Depends
from sqlalchemy import ColumnElement, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.employee import Employee
from app.models.evaluation import Evaluation
from app.schemas.employee import ROSTER_ATTRIBUTES


class RosterYearPage(NamedTuple):
    """One page of the admin roster read: employee rows beside their year's
    evaluation (None where the roster row stands alone), the page slice's
    total under the applied filter, and the status distribution over
    the whole roster."""

    rows: list[tuple[Employee, Evaluation | None]]
    total: int
    status_counts: dict[str, int]


def _board_status() -> ColumnElement[str]:
    """The board's status word for one roster × evaluation join row.

    The stored status *is* the word (six-state column, pr_0006): the wire
    form is the lower-cased stored value, and roster rows without an
    evaluation read "not_started" — the word the no-row case owns. Python
    mirror: services.self_evaluation._board_status. Keep the pair in step.
    """
    return case(
        (Evaluation.employee_id.is_(None), "not_started"),
        else_=func.lower(Evaluation.status),
    )


class EmployeeRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, employee_id: str) -> Employee | None:
        return await self._session.get(Employee, employee_id)

    async def get_by_email(self, email: str) -> Employee | None:
        # Case-insensitive on purpose: roster emails are not normalized
        # upstream, and sign-in must match the stored address as typed or not
        # at all — both layers agree on the lower-cased form here.
        statement = select(Employee).where(
            func.lower(Employee.email) == email.strip().lower()
        )
        return await self._session.scalar(statement)

    async def get_many_by_email(self, emails: Sequence[str]) -> dict[str, Employee]:
        """Stored rows keyed by their lower-cased email — roster imports match
        employees by email identity (case-insensitive), not employee_id."""
        normalized = sorted({email.strip().lower() for email in emails})
        rows = await self._session.execute(
            select(func.lower(Employee.email), Employee).where(
                func.lower(Employee.email).in_(normalized)
            )
        )
        return {key: employee for key, employee in rows}

    async def get_many(self, employee_ids: Sequence[str]) -> dict[str, Employee]:
        statement = select(Employee).where(Employee.employee_id.in_(employee_ids))
        rows = await self._session.scalars(statement)
        return {row.employee_id: row for row in rows}

    async def paged(self, page: int, page_size: int) -> tuple[list[Employee], int]:
        """One roster page (roster order: name, then id) with the table's
        total row count — list endpoints never load the whole roster."""
        total = await self._session.scalar(select(func.count()).select_from(Employee))
        result = await self._session.scalars(
            select(Employee)
            .order_by(Employee.employee_name, Employee.employee_id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result), total or 0

    async def roster_year_page(
        self,
        review_year: int,
        statuses: Sequence[str] | None,
        page: int,
        page_size: int,
    ) -> RosterYearPage:
        """The admin board read: `statuses` (wire words; None = all) may
        narrow both the page and the total, while counts always cover the
        whole roster. Roster order: name, then id."""
        status_word = _board_status()
        join_on = and_(
            Evaluation.employee_id == Employee.employee_id,
            Evaluation.review_year == review_year,
        )
        filtered = (
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(status_word.in_(statuses))
        ) if statuses is not None else (
            select(func.count()).select_from(Employee)
        )
        total = await self._session.scalar(filtered) or 0

        grouped = (
            select(status_word, func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .group_by(status_word)
        )
        status_counts = {
            row[0]: row[1] for row in await self._session.execute(grouped)
        }

        rows_statement = (
            select(Employee, Evaluation)
            .outerjoin(Evaluation, join_on)
        )
        if statuses is not None:
            rows_statement = rows_statement.where(status_word.in_(statuses))
        result = await self._session.execute(
            rows_statement
            .order_by(Employee.employee_name, Employee.employee_id)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return RosterYearPage(
            rows=[(employee, evaluation) for employee, evaluation in result],
            total=total,
            status_counts=status_counts,
        )

    async def insert_many(self, employees: list[Employee]) -> None:
        # Flush so key/e-mail collisions surface inside the request instead of
        # at commit time, where they would bypass the error envelope.
        self._session.add_all(employees)
        await self._session.flush()

    async def update_many(
        self, updates: list[tuple[str, Employee]]
    ) -> set[str]:
        """Overwrite each stored row with the values its paired instance
        carries: the pair keys the row by its stored PK, while the instance's
        employee_id becomes the row's PK — identical where the CSV did not
        move the ID, new (evaluations following via ON UPDATE CASCADE) where
        it did. Returns the PKs the rows carry after the write."""
        updated: set[str] = set()
        for stored_pk, employee in updates:
            stored = await self._session.get(Employee, stored_pk)
            if stored is None:
                continue
            for _schema_field, column in ROSTER_ATTRIBUTES:
                setattr(stored, column, getattr(employee, column))
            stored.employee_id = employee.employee_id
            updated.add(employee.employee_id)
        await self._session.flush()
        return updated


def get_employee_repository(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> AsyncIterator[EmployeeRepository]:
    yield EmployeeRepository(session)