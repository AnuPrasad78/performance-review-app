"""Builders shared by the self-evaluation API tests: one roster employee,
the cycle variants, and stub repositories wired through dependency
overrides (provider-callable pattern, per test_roster_import.py)."""

import datetime
from collections.abc import Callable

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.models.evaluation import Evaluation
from app.models.review_cycle import ReviewCycle
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.employee_repository import RosterYearPage, get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES
from app.schemas.table_query import TableQuery

#: The board's wire words in workflow order — the same six-state vocabulary
#: the status column stores (pr_0006), so the real repository's status-rank
#: CASE and this stub mirror stay in step.
STATUS_RANK = {
    "not_started": 0,
    "self_evaluation_in_progress": 1,
    "self_evaluation_completed": 2,
    "in_manager_review": 3,
    "manager_evaluation_in_progress": 4,
    "manager_evaluation_completed": 5,
}

#: The open window: everything (submit deadline, manager window) in the future.
#: The deadline is an aware UTC instant — late on its day, so real now()
#: decides openness; tests never freeze the clock.
CYCLE = ReviewCycle(
    review_year=2026,
    submission_deadline=datetime.datetime(2027, 1, 15, 23, 59, tzinfo=datetime.timezone.utc),
    manager_review_start=datetime.date(2027, 1, 16),
    manager_review_end=datetime.date(2027, 2, 15),
    hr_approval_release_by=datetime.date(2027, 3, 1),
)

#: Deadline gone; manager window closed — only useful for rejection paths.
PASSED_CYCLE = ReviewCycle(
    review_year=2026,
    submission_deadline=datetime.datetime(2026, 1, 31, 23, 59, tzinfo=datetime.timezone.utc),
    manager_review_start=datetime.date(2026, 2, 1),
    manager_review_end=datetime.date(2026, 2, 28),
    hr_approval_release_by=datetime.date(2026, 3, 1),
)

def roster_employee(employee_id: str = "EMP-V001", name: str = "Asha Menon") -> Employee:
    employee = Employee(employee_id=employee_id)
    for _schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, "")
    employee.employee_name = name
    # Roster emails follow the first_lastname convention the real CSV uses.
    employee.email = f"{name.lower().replace(' ', '_')}@emids.com"
    employee.designation = "Software Engineer"
    employee.org = "Delivery"
    employee.business_unit = "Payer Digital"
    employee.reporting_manager = "Priya Raghavan"
    employee.employment_status = "Active"
    return employee


def evaluation(status: str, employee_id: str = "EMP-V001", **overrides: object) -> Evaluation:
    row = Evaluation(
        employee_id=employee_id,
        review_year=2026,
        email="asha_menon@emids.com",
        status=status,
        cycle_id=1,
        forward_commitments=[
            {"commitment": "Own the intake rewrite", "support": "Lead mentoring"},
        ],
    )
    for key, value in overrides.items():
        setattr(row, key, value)
    return row


class _StubEmployeeRepository:
    def __init__(self, employee: Employee) -> None:
        self._employee = employee

    async def get(self, employee_id: str) -> Employee | None:
        return self._employee if employee_id == self._employee.employee_id else None

    async def get_by_email(self, email: str) -> Employee | None:
        return self._employee


_FILTER_FIELDS = (
    "designation",
    "location",
    "org",
    "business_unit",
    "reporting_manager",
    "employment_status",
)


def matches_query(employee: Employee, query: TableQuery) -> bool:
    """The real repository's roster WHERE for one row, mirrored: search hits
    the employee name or designation, dropdown fields match exactly."""
    if query.search:
        needle = query.search.lower()
        if (
            needle not in (employee.employee_name or "").lower()
            and needle not in (employee.designation or "").lower()
        ):
            return False
    return all(
        not getattr(query, field) or getattr(employee, field) == getattr(query, field)
        for field in _FILTER_FIELDS
    )


#: The wire sort words against the Employee attributes they order.
SORT_FIELDS: dict[str, str] = {
    "employeeName": "employee_name",
    "employeeId": "employee_id",
    "email": "email",
    "designation": "designation",
    "location": "location",
    "org": "org",
    "businessUnit": "business_unit",
    "reportingManager": "reporting_manager",
    "employmentStatus": "employment_status",
}


def order_by_query(
    employees: list[Employee],
    query: TableQuery,
    status_word: Callable[[Employee], str] | None = None,
) -> None:
    """In-place stub of the real repository's ordering. Two stable passes so
    a descending lead keeps the ascending name/id tiebreakers — the same
    order the real repository's SQL yields."""
    employees.sort(key=lambda one: (one.employee_name, one.employee_id))

    def lead_value(employee: Employee) -> object:
        if query.sort_by == "status":
            assert status_word is not None
            return STATUS_RANK[status_word(employee)]
        return getattr(employee, SORT_FIELDS[query.sort_by])

    employees.sort(key=lead_value, reverse=query.sort_order == "desc")


class _RosterRepository:
    """Board-side stub: employees beside that year's evaluations, paged the
    way the real repository slices (filter → order → offset/limit)."""

    def __init__(
        self,
        employees: list[Employee],
        rows: dict[str, Evaluation] | None = None,
    ) -> None:
        self._stored = list(employees)
        self._rows = rows or {}

    async def get(self, employee_id: str) -> Employee | None:
        return next(
            (one for one in self._stored if one.employee_id == employee_id), None
        )

    async def get_by_email(self, email: str) -> Employee | None:
        return next(
            (one for one in self._stored if one.email == email.strip().lower()), None
        )

    async def update_employee(
        self,
        employee: Employee,
        values: dict[str, str],
        *,
        employee_id_to: str | None = None,
    ) -> Employee:
        stored = next(
            (one for one in self._stored if one.employee_id == employee.employee_id), None
        )
        if stored is not employee:
            raise AssertionError("the service patches a row this roster never served")
        for column, value in values.items():
            setattr(stored, column, value)
        if employee_id_to is not None:
            stored.employee_id = employee_id_to
        return stored

    async def count_matching(
        self,
        query: TableQuery,
        *,
        review_year: int | None = None,
        statuses: list[str] | None = None,
    ) -> int:
        from app.services.self_evaluation import _board_status

        pairs = [
            (one, self._rows.get(one.employee_id)) for one in self._stored
        ]
        if statuses is not None:
            # The real read joins the year's evaluations and keeps the matched
            # status words only — roster rows without an evaluation row drop out.
            pairs = [
                pair
                for pair in pairs
                if pair[1] is not None
                and pair[1].review_year == review_year
                and _board_status(pair[1]) in set(statuses)
            ]
        pairs = [pair for pair in pairs if matches_query(pair[0], query)]
        return len(pairs)

    async def roster_year_matching(
        self,
        review_year: int,
        query: TableQuery,
        statuses: list[str] | None = None,
    ) -> list[tuple[Employee, Evaluation | None]]:
        from app.services.self_evaluation import _board_status

        pairs = [
            (one, self._rows.get(one.employee_id)) for one in self._stored
        ]
        pairs = [pair for pair in pairs if pair[1] is None or pair[1].review_year == review_year]
        if statuses is not None:
            pairs = [
                pair
                for pair in pairs
                if pair[1] is not None and _board_status(pair[1]) in set(statuses)
            ]
        pairs = [pair for pair in pairs if matches_query(pair[0], query)]
        rows = [pair[0] for pair in pairs]
        order_by_query(rows, query)
        by_id = {pair[0].employee_id: pair for pair in pairs}
        return [by_id[one.employee_id] for one in rows]

    async def roster_year_page(
        self,
        review_year: int,
        query: TableQuery,
        statuses: list[str] | None,
        page: int,
        page_size: int,
    ) -> RosterYearPage:
        from app.services.self_evaluation import _board_status

        pairs = [(one, self._rows.get(one.employee_id)) for one in self._stored]
        counts: dict[str, int] = {}
        for _, row in pairs:
            word = _board_status(row)
            counts[word] = counts.get(word, 0) + 1
        pairs = [pair for pair in pairs if matches_query(pair[0], query)]
        if statuses is not None:
            pairs = [pair for pair in pairs if _board_status(pair[1]) in set(statuses)]

        # order_by_query works on Employee lists; the status word derives
        # from that employee's evaluation (None for roster-only rows).
        def status_for(employee: Employee) -> str:
            return _board_status(
                self._rows.get(employee.employee_id)
            )

        rows = [pair[0] for pair in pairs]
        order_by_query(rows, query, status_word=status_for)
        by_id = {pair[0].employee_id: pair for pair in pairs}
        pairs = [by_id[one.employee_id] for one in rows]
        offset = (page - 1) * page_size
        return RosterYearPage(
            rows=pairs[offset : offset + page_size],
            total=len(pairs),
            status_counts=counts,
        )


class MutableEvaluationRepository:
    """Keeps the row the service created or loaded, so write tests can then
    assert on the stored state as a real transaction-end read would."""

    def __init__(self, evaluation: Evaluation | None) -> None:
        self.row = evaluation

    async def get_for_employee(self, employee_id: str, review_year: int) -> Evaluation | None:
        if self.row is None or self.row.employee_id != employee_id:
            return None
        return self.row

    async def add(self, evaluation: Evaluation) -> None:
        self.row = evaluation


class BoardEvaluationRepository:
    """Board-side stub: many rows in one dict; get_or_create not needed here."""

    def __init__(self, rows: list[Evaluation]) -> None:
        self._rows = {
            row.employee_id: row
            for row in rows
            if row.review_year == 2026
        }

    async def get_for_employee(self, employee_id: str, review_year: int) -> Evaluation | None:
        return self._rows.get(employee_id)


class _StubCycleRepository:
    def __init__(self, cycle: ReviewCycle | None) -> None:
        self._cycle = cycle

    async def current(self) -> ReviewCycle | None:
        return self._cycle


def make_client(
    employee: Employee | None = None,
    cycle: ReviewCycle | None = CYCLE,
    evaluation_row: Evaluation | None = None,
) -> tuple[TestClient, MutableEvaluationRepository]:
    """Builds the TestClient and hands back the mutable evaluation stub — the
    same object the service mutated through the request."""
    employee = employee if employee is not None else roster_employee()
    settings = Settings(database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored")
    app = create_app(settings)
    # get_settings is the lru_cache accessor the DI layer uses; without this
    # override the test's settings lose to a process-cached .env read.
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: _StubEmployeeRepository(employee)
    evaluations = MutableEvaluationRepository(evaluation_row)
    app.dependency_overrides[get_evaluation_repository] = lambda: evaluations
    app.dependency_overrides[get_review_cycle_repository] = lambda: _StubCycleRepository(cycle)
    return TestClient(app), evaluations


def make_board_client(
    employees: list[Employee],
    rows: list[Evaluation],
    cycle: ReviewCycle | None = CYCLE,
    admin_emails: list[str] | None = None,
) -> TestClient:
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=admin_emails or [],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: _RosterRepository(
        employees, {row.employee_id: row for row in rows if row.review_year == 2026}
    )
    app.dependency_overrides[get_evaluation_repository] = lambda: BoardEvaluationRepository(rows)
    app.dependency_overrides[get_review_cycle_repository] = lambda: _StubCycleRepository(cycle)
    return TestClient(app)


IDENTITY = {"X-Stub-User": "asha_menon@emids.com"}


def read(client: TestClient) -> object:
    return client.get("/api/evaluations/me", headers=IDENTITY)


def save(client: TestClient, body: object) -> object:
    return client.patch("/api/evaluations/me", json=body, headers=IDENTITY)


def submit(client: TestClient) -> object:
    return client.post("/api/evaluations/me/submit", headers=IDENTITY)
