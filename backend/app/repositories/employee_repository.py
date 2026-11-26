"""Reads and writes for the employees table.

Owed by the DAL contract: every query the app runs against employees lives
here; services describe *what* should happen, not how rows are fetched. The
session commits at request end (core/db.py), so flushes — not commits — keep
query results and constraint checks visible within the unit of work.
Pagination and the admin board's roster × evaluation join are reads served
here so no list endpoint ever materializes the full table.
"""

from collections.abc import AsyncIterator, Mapping, Sequence
from typing import Annotated, NamedTuple

from fastapi import Depends
from sqlalchemy import ColumnElement, and_, asc, case, desc, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.models.employee import Employee
from app.models.evaluation import Evaluation
from app.schemas.employee import ROSTER_ATTRIBUTES
from app.schemas.table_query import RosterSortKey, TableQuery


class RosterYearPage(NamedTuple):
    """One page of the admin roster read: employee rows beside their year's
    evaluation (None where the roster row stands alone), the page slice's
    total under the applied filter (search, dropdowns, AND the status word),
    and the status distribution under the composed search and dropdown
    filters — deliberately never the status word."""

    rows: list[tuple[Employee, Evaluation | None]]
    total: int
    status_counts: dict[str, int]


class RosterFacetColumns(NamedTuple):
    """Distinct, non-blank dropdown values per filterable roster column."""

    designations: list[str]
    locations: list[str]
    orgs: list[str]
    business_units: list[str]
    business_partners: list[str]
    reporting_managers: list[str]
    employment_statuses: list[str]


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


_SEARCH_COLUMNS = (Employee.employee_name, Employee.designation)

_FILTER_COLUMNS = (
    ("designation", Employee.designation),
    ("location", Employee.location),
    ("org", Employee.org),
    ("business_unit", Employee.business_unit),
    ("business_partner", Employee.business_partner),
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
    "businessUnit": Employee.business_unit,
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
    query: TableQuery, status_word: ColumnElement[str] | None
) -> list[ColumnElement]:
    """Ordering with the workflow tiebreakers after the admin's choice; the
    board's status sorts by the lifecycle rank (not started → self-eval in
    progress → … → manager evaluation completed), never alphabetically. The
    rank mirrors the same single vocabulary the column stores (pr_0006)."""
    direction = asc if query.sort_order == "asc" else desc
    if status_word is not None and query.sort_by == "status":
        rank = case(
            (status_word == "not_started", 0),
            (status_word == "self_evaluation_in_progress", 1),
            (status_word == "self_evaluation_completed", 2),
            (status_word == "in_manager_review", 3),
            (status_word == "manager_evaluation_in_progress", 4),
            else_=5,
        )
        lead: ColumnElement = rank
    else:
        lead = _ROSTER_SORTS[query.sort_by]
    return [
        direction(lead),
        asc(Employee.employee_name),
        asc(Employee.employee_id),
    ]


def _year_join(review_year: int) -> ColumnElement[bool]:
    """employees ⋈ evaluations for one cycle year — the join the admin board
    and the users table's status filter share."""
    return and_(
        Evaluation.employee_id == Employee.employee_id,
        Evaluation.review_year == review_year,
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

    async def update_employee(
        self,
        employee: Employee,
        values: Mapping[str, str],
        *,
        employee_id_to: str | None = None,
    ) -> Employee:
        """Writes the patch's (employees column -> value) pairs onto the
        stored row; `employee_id_to` re-keys it when the patch moves the
        primary key (evaluation rows follow via ON UPDATE CASCADE). Flush
        keeps the write visible in the same request (core/db.py commits at
        its end) and surfaces constraint clashes inside the envelope."""
        for column, value in values.items():
            setattr(employee, column, value)
        if employee_id_to is not None:
            employee.employee_id = employee_id_to
        await self._session.flush()
        return employee

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
        self,
        query: TableQuery,
        page: int,
        page_size: int,
        *,
        review_year: int | None = None,
        statuses: Sequence[str] | None = None,
    ) -> tuple[list[Employee], int]:
        """One roster page under the composed `query` with the filtered total
        — list endpoints never load the whole roster. `statuses` (the wire
        status words the service maps from query.status; None = any) narrows
        the page and its total through the year's evaluation join, exactly as
        roster_year_page does."""
        conditions = _roster_conditions(query)
        if statuses is None:
            total = await self._session.scalar(
                select(func.count()).select_from(Employee).where(*conditions)
            )
            result = await self._session.scalars(
                select(Employee)
                .where(*conditions)
                .order_by(*_roster_order(query, None))
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            return list(result), total or 0

        status_word = _board_status()
        assert review_year is not None, "statuses filtering requires the cycle's review year"
        join_on = _year_join(review_year)
        total = await self._session.scalar(
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions, status_word.in_(statuses))
        )
        result = await self._session.scalars(
            select(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions, status_word.in_(statuses))
            .order_by(*_roster_order(query, status_word))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        return list(result), total or 0

    async def matching(
        self,
        query: TableQuery,
        *,
        review_year: int | None = None,
        statuses: Sequence[str] | None = None,
    ) -> list[Employee]:
        """Every roster row under the composed `query`, ordered as the list
        endpoints order them — the CSV export's read; `statuses` narrows
        through the year's evaluation join as paged() does."""
        conditions = _roster_conditions(query)
        if statuses is None:
            result = await self._session.scalars(
                select(Employee).where(*conditions).order_by(*_roster_order(query, None))
            )
        else:
            status_word = _board_status()
            assert review_year is not None, "statuses filtering requires the cycle's review year"
            result = await self._session.scalars(
                select(Employee)
                .outerjoin(Evaluation, _year_join(review_year))
                .where(*conditions, status_word.in_(statuses))
                .order_by(*_roster_order(query, status_word))
            )
        return list(result)

    async def count_matching(
        self,
        query: TableQuery,
        *,
        review_year: int | None = None,
        statuses: Sequence[str] | None = None,
    ) -> int:
        """How many roster rows the composed `query` matches under the same
        narrowing rules `matching()` applies — the bulk-review count's read,
        no rows fetched."""
        conditions = _roster_conditions(query)
        if statuses is None:
            total = await self._session.scalar(
                select(func.count()).select_from(Employee).where(*conditions)
            )
            return total or 0
        status_word = _board_status()
        assert review_year is not None, "statuses filtering requires the cycle's review year"
        total = await self._session.scalar(
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, _year_join(review_year))
            .where(*conditions, status_word.in_(statuses))
        )
        return total or 0

    async def roster_year_matching(
        self,
        review_year: int,
        query: TableQuery,
        statuses: Sequence[str] | None = None,
    ) -> list[tuple[Employee, Evaluation | None]]:
        """Every roster row beside its year's evaluation under the composed
        `query`, ordered as the list endpoints order them — the review
        document export's read (the paged board's twin without the slice)."""
        status_word = _board_status()
        conditions = _roster_conditions(query)
        rows_statement = (
            select(Employee, Evaluation)
            .outerjoin(Evaluation, _year_join(review_year))
            .where(*conditions)
        )
        if statuses is not None:
            rows_statement = rows_statement.where(status_word.in_(statuses))
        result = await self._session.execute(
            rows_statement.order_by(*_roster_order(query, status_word=status_word))
        )
        return [(employee, evaluation) for employee, evaluation in result]

    async def roster_year_page(
        self,
        review_year: int,
        query: TableQuery,
        statuses: Sequence[str] | None,
        page: int,
        page_size: int,
    ) -> RosterYearPage:
        """The admin board read: `statuses` (the wire words the service maps
        from query.status; None = all) may narrow both the page and the total,
        while the employee columns of `query` filter alongside. The status
        counts narrow by the composed search and dropdown columns — the
        board's pie and tiles describe exactly what the Search & Filter
        narrows — yet never by the status word itself: the pie *is* the
        status breakdown, and counting under the status word would collapse
        it to one color. The stored status is the whole rule for the word
        (six-state column, pr_0006); roster rows without an evaluation read
        "not_started" by definition."""
        status_word = _board_status()
        conditions = _roster_conditions(query)
        join_on = _year_join(review_year)
        filtered = (
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions, status_word.in_(statuses))
        ) if statuses is not None else (
            select(func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions)
        )
        total = await self._session.scalar(filtered) or 0

        grouped = (
            # The counts' narrowing: the search and dropdown verbs only —
            # never the status word, by design (see the docstring above).
            select(status_word, func.count())
            .select_from(Employee)
            .outerjoin(Evaluation, join_on)
            .where(*conditions)
            .group_by(status_word)
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
            rows_statement = rows_statement.where(status_word.in_(statuses))
        result = await self._session.execute(
            rows_statement
            .order_by(*_roster_order(query, status_word=status_word))
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
            business_units=await values(Employee.business_unit),
            business_partners=await values(Employee.business_partner),
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
