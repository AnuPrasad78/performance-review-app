"""Builders shared by the self-evaluation API tests: one roster employee,
the cycle variants, and stub repositories wired through dependency
overrides (provider-callable pattern, per test_roster_import.py)."""

import datetime

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.models.evaluation import Evaluation
from app.models.review_cycle import ReviewCycle
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES

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
    employee.reporting_manager = "Priya Raghavan"
    employee.employment_status = "Active"
    return employee


def evaluation(status: str, employee_id: str = "EMP-V001", **overrides: object) -> Evaluation:
    row = Evaluation(
        employee_id=employee_id,
        review_year=2026,
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


class _RosterRepository:
    """Board-side stub: many employees, list_all included."""

    def __init__(self, employees: list[Employee]) -> None:
        self._stored = list(employees)

    async def get(self, employee_id: str) -> Employee | None:
        return next(
            (one for one in self._stored if one.employee_id == employee_id), None
        )

    async def get_by_email(self, email: str) -> Employee | None:
        return next(
            (one for one in self._stored if one.email == email.strip().lower()), None
        )

    async def list_all(self) -> list[Employee]:
        return list(self._stored)


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

    async def list_by_year(self, review_year: int) -> dict[str, Evaluation]:
        if review_year != 2026:
            return {}
        return dict(self._rows)


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
    app.dependency_overrides[get_employee_repository] = lambda: _RosterRepository(employees)
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
