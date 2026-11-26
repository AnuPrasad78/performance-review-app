"""The Users table's reads behind services/roster_read: the form-status
filter on GET /api/employees (each filter word naming exactly its stored
lifecycle word, applied through the year's evaluation join) and the
admin-gated CSV export that honors the same composed query. Repositories are
stubbed; the stub mirrors the real paged/matching reads the way
evaluation_fixtures does."""

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.table_query import TableQuery
from tests.evaluation_fixtures import (
    CYCLE,
    matches_query,
    order_by_query,
    roster_employee,
)

ADMIN_EVERYONE = ["asha_menon@emids.com"]
ADMIN_IDENTITY = {"X-Stub-User": ADMIN_EVERYONE[0]}

#: The lifecycle spread, by fixture: Asha's row was never opened (and Bilal's
#: is mid self-eval), Cara's review sits in the manager phase.
ROWS_STATUS = {"EMP-V001": "not_started", "EMP-V002": "self_evaluation_in_progress", "EMP-V003": "in_manager_review"}


class _ReadStub:
    """paged + matching over employees beside their cycle evaluations — the
    two Users-table reads, filtered the way the real repository composes."""

    def __init__(self, employees: list[Employee], rows: dict[str, str]) -> None:
        self._stored = list(employees)
        self._status_word = rows

    async def get_by_email(self, email: str) -> Employee | None:
        # Identity resolution for the admin gate: a matching roster row turns
        # the address into the identity whose allow-list role decides 403 vs
        # access; an unknown address stays unresolved (the 401 path).
        return next(
            (one for one in self._stored if one.email == email.strip().lower()), None
        )

    def _pairs(
        self,
        query: TableQuery,
        statuses: list[str] | None,
        review_year: int | None,
    ) -> list[tuple[Employee, str]]:
        words = None if statuses is None else frozenset(statuses)
        pairs: list[tuple[Employee, str]] = []
        for employee in self._stored:
            if not matches_query(employee, query):
                continue
            word = self._status_word.get(employee.employee_id, "not_started")
            if words is None or word in words:
                pairs.append((employee, word))
        return pairs

    async def paged(
        self,
        query: TableQuery,
        page: int,
        page_size: int,
        *,
        review_year: int | None = None,
        statuses: list[str] | None = None,
    ) -> tuple[list[Employee], int]:
        pairs = self._pairs(query, statuses, review_year)
        ordered = [pair[0] for pair in pairs]
        order_by_query(ordered, query)
        by_id = {pair[0].employee_id: pair for pair in pairs}
        offset = (page - 1) * page_size
        return [by_id[one.employee_id][0] for one in ordered[offset : offset + page_size]], len(pairs)

    async def matching(
        self,
        query: TableQuery,
        *,
        review_year: int | None = None,
        statuses: list[str] | None = None,
    ) -> list[Employee]:
        return [pair[0] for pair in self._pairs(query, statuses, review_year)]


class _NoCycleStub:
    async def current(self) -> None:
        return None


class _CurrentCycleStub:
    async def current(self):
        return CYCLE


def make_client(
    employees: list[Employee],
    rows: dict[str, str] | None = None,
    cycle: bool = True,
    admin_emails: list[str] | None = ADMIN_EVERYONE,
) -> TestClient:
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=admin_emails or [],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: _ReadStub(
        employees, rows or {}
    )
    app.dependency_overrides[get_review_cycle_repository] = lambda: (
        _CurrentCycleStub() if cycle else _NoCycleStub()
    )
    return TestClient(app)


def _employees() -> list[Employee]:
    return [roster_employee("EMP-V001", "Asha Menon"), roster_employee("EMP-V002", "Bilal Khan"), roster_employee("EMP-V003", "Cara Fernandes")]


# --- the form-status filter on the Users list --------------------------------


def test_a_status_word_narrows_the_list_to_exactly_that_word() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get("/api/employees", params={"status": "self_evaluation_in_progress"})

    body = response.json()
    # The word *is* the filter: Bilal's form is underway; neither the never-
    # opened row nor the manager-phase one answers the same word.
    assert [row["employeeId"] for row in body["employees"]] == ["EMP-V002"]
    assert body["total"] == 1


def test_the_manager_phase_word_narrows_to_that_stage_alone() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get("/api/employees", params={"status": "in_manager_review"})

    body = response.json()
    assert [row["employeeId"] for row in body["employees"]] == ["EMP-V003"]
    assert body["total"] == 1


def test_not_started_covers_both_never_opened_and_opened_empty() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get("/api/employees", params={"status": "not_started"})

    body = response.json()
    assert [row["employeeId"] for row in body["employees"]] == ["EMP-V001"]
    assert body["total"] == 1


def test_a_missing_cycle_answers_cycle_missing_only_when_the_filter_needs_it() -> None:
    client = make_client(_employees(), ROWS_STATUS, cycle=False)

    plain = client.get("/api/employees")
    filtered = client.get("/api/employees", params={"status": "not_started"})

    assert plain.status_code == 200
    assert filtered.status_code == 404
    assert filtered.json()["code"] == "cycle_missing"


def test_the_status_filter_composes_with_roster_filters_and_pages() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get(
        "/api/employees",
        params={"status": "self_evaluation_in_progress", "org": "Delivery", "sortBy": "employeeName", "sortOrder": "desc"},
    )

    assert [row["employeeId"] for row in response.json()["employees"]] == ["EMP-V002"]


# --- the CSV export ----------------------------------------------------------


EXPORT_HEADERS = (
    "Employee Name,Employee ID,Email,Designation,Location,Org,Business Unit,"
    "Current Account / Project,Delivery Head,Delivery Manager,Business Partner,"
    "Reporting Manager,Status"
)


def test_the_export_streams_the_matched_rows_as_roster_csv() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get("/api/employees/export", headers=ADMIN_IDENTITY)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/csv")
    assert 'attachment; filename="employee-roster.csv"' in response.headers["content-disposition"]
    body = response.content.decode("utf-8")
    lines = body.split("\r\n")
    assert lines[0] == chr(0xFEFF) + EXPORT_HEADERS
    assert len(lines) == 5  # header + 3 rows + trailing newline
    assert lines[1].startswith("Asha Menon,EMP-V001,asha_menon@emids.com")


def test_the_export_honors_the_composed_filters() -> None:
    client = make_client(_employees(), ROWS_STATUS)

    response = client.get(
        "/api/employees/export",
        params={"status": "in_manager_review", "org": "Delivery"},
        headers=ADMIN_IDENTITY,
    )

    rows = [line for line in response.content.decode("utf-8").split("\r\n") if line]
    assert len(rows) == 2  # header + Cara, the manager-phase Delivery row
    assert rows[0] == chr(0xFEFF) + EXPORT_HEADERS
    assert [row.removeprefix(chr(0xFEFF)).split(",")[1] for row in rows[1:]] == ["EMP-V003"]


def test_the_export_requires_an_admin_identity() -> None:
    client = make_client(_employees())

    anonymous = client.get("/api/employees/export")
    non_admin = client.get(
        "/api/employees/export", headers={"X-Stub-User": "bilal_khan@emids.com"}
    )

    assert anonymous.status_code == 401
    assert non_admin.status_code == 403
