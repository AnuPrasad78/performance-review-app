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
from sqlalchemy import ColumnElement, and_, asc, case, desc, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.employee import Employee
from app.models.evaluation import RESPONSE_TOPICS, STATUS_IN_PROGRESS, Evaluation
from app.schemas.employee import ROSTER_ATTRIBUTES
from app.schemas.table_query import RosterSortKey, SortOrder, TableQuery


class RosterYearPage(NamedTuple):
    """One page of the admin roster read: employee rows beside their year's
    evaluation (None where the roster row stands alone), the page slice's
    total under the applied filter, and the derived-status distribution over
    the whole roster."""

    rows: list[tuple[Employee, Evaluation | None]]
    total: int
    status_counts: dict[str, int]


class RosterFacetColumns(NamedTuple):
    """Distinct, non-blank dropdown values per filterable roster column."""

    designations: list[str]
    locations: list[str]
    orgs: list[str]
    reporting_managers: list[str]
    employment_statuses: list[str]


def _evaluation_answered() -> ColumnElement[bool]:
    """Whether any of the evaluation's employee-response columns hold text."""
    columns = (getattr(Evaluation, topic[1]) for topic in RESPONSE_TOPICS)
    return or_(*(func.coalesce(column, "") != "" for column in columns))


def _derived_status() -> ColumnElement[str]:
    """The board's derived status word for one roster × evaluation join row.

    Python mirror: services.self_evaluation._board_status owns the rule; this
    is the same workflow fact expressed as SQL so filtering and counting stay
    in the database. Keep the pair in step.
    """
    return case(
        (Evaluation.employee_id.is_(None), "not_started"),
        (
            Evaluation.status == STATUS_IN_PROGRESS,
            case((_evaluation_answered(), "in_progress"), else_="not_started"),
        ),
        else_=case(
            (Evaluation.employee_signed_at.is_not(None), "signed_off"),
            else_="submitted",
        ),
    )


_SEARCH_COLUMNS = (Employee.employee_name, Employee.designation)

_FILTER_COLUMNS = (
    ("designation", Employee.designation),
    ("location", Employee.location),
    ("org", Employee.org),
    ("reporting_manager", Employee.reporting_manager),
    ("employment_status", Employee.employment_status),
)

_ROSTER_SORTS: dict[RosterSortKey, ColumnElement] = {
    "employeeName": Employee.employee_name,
    "employeeId": Employee.employee_id,
    "email": Employee.email,
    "designation": Employee.designation,
    "location": Employee.location,
    "org": Employee.org,
    "reportingManager": Employee.reporting_manager,
    "employmentStatus": Employee.employment_status,
}


def _search_conditions(search: str) -> list[ColumnElement[bool]]:
    needle = f"%{search}%"
    return [or_(*(column.ilike(needle) for column in _SEARCH_COLUMNS))]


def _roster_conditions(query: TableQuery) -> list[ColumnElement[bool]]:
    """The joint WHERE for a roster read: one touchpoint so the page's count
    and slice always agree. Blank terms mean "any" and contribute nothing."""
    conditions: list[ColumnElement[bool]] = []
    if query.search:
        conditions.extend(_search_conditions(query.search))
    conditions.extend(
        column == getattr(query, field)
        for field, column in _FILTER_COLUMNS
        if getattr(query, field)
    )
    return conditions


def _roster_order(
    query: TableQuery, derived: ColumnElement[str] | None
) -> list[ColumnElement]:
    """Ordering with the workflow tiebreakers after the admin's choice; the
    board's derived status sorts by the workflow rank (not started → in
    progress → submitted → signed off), never alphabetically."""
    direction = asc if query.sort_order == "asc" else desc
    if derived is not None and query.sort_by == "status":
        rank = case(
            (derived == "not_started", 0),
            (derived == "in_progress", 1),
            (derived == "submitted", 2),
            else_=3,
        )
        lead: ColumnElement = rank
    else:
        lead = _ROSTER_SORTS[query.sort_by]
    return [
        direction(lead),
        asc(Employee.employee_name),
        asc(Employee.employee_id),
    ]


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

    async def paged(
        self, query: TableQuery, page: int, page_size: int
    ) -> tuple[list[Employee], int]:
        """One roster page under the composed `query` with the filtered total
        — list endpoints never load the whole roster."""
        conditions = _roster_conditions(query)
        total = await self._session.scalar(
            select(func.count()).select_from(Employee).where(*conditions)
        )
        result = await self._session.scalars(
            select(Employee)
            .where(*conditions)
            .order_by(*_roster_order(query, derived=None))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result), total or 0

    async def roster_year_page(
        self,
        review_year: int,
        query: TableQuery,
        statuses: Sequence[str] | None,
        page: int,
        page_size: int,
    ) -> RosterYearPage:
        """The admin board read: `statuses` (derived words the service maps
        from `query.status`; None = all) narrows both the page and the total,
        while the employee columns of `query` filter alongside and the status
        counts always cover the whole roster — the board's tiles describe the
        roster for the cycle, not the filtered view."""
        derived = _derived_status()
        conditions = _roster_conditions(query)
        join_on = and_(
            Evaluation.employee_id == Employee.employee_id,
            Evaluation.review_year == review_year,
        )
        filtered = (
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions, derived.in_(statuses))
        ) if statuses is not None else (
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions)
        )
        total = await self._session.scalar(filtered) or 0

        grouped = (
            select(derived, func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .group_by(derived)
        )
        status_counts = {
            row[0]: row[1] for row in await self._session.execute(grouped)
        }

        rows_statement = (
            select(Employee, Evaluation)
            .outerjoin(Evaluation, join_on)
            .where(*conditions)
        )
        if statuses is not None:
            rows_statement = rows_statement.where(derived.in_(statuses))
        result = await self._session.execute(
            rows_statement
            .order_by(*_roster_order(query, derived=derived))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return RosterYearPage(
            rows=[(employee, evaluation) for employee, evaluation in result],
            total=total,
            status_counts=status_counts,
        )

    async def facet_values(self) -> RosterFacetColumns:
        """Distinct non-blank values per filterable column, sorted — the
        filter dropdowns' option lists. Whole-roster, independent of any
        current filter."""
        async def values(column) -> list[str]:
            rows = await self._session.scalars(
                select(distinct(column))
                .where(column.is_not(None), func.trim(column) != "")
                .order_by(column)
            )
            return list(rows)

        return RosterFacetColumns(
            designations=await values(Employee.designation),
            locations=await values(Employee.location),
            orgs=await values(Employee.org),
            reporting_managers=await values(Employee.reporting_manager),
            employment_statuses=await values(Employee.employment_status),
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
