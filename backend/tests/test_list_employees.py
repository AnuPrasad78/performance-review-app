"""GET /api/employees — the admin Users table's composed read: search, the
five dropdown filters and sort compose server-side, and an unknown sort word
is rejected at validation. Repositories are stubbed (the shared mirror in
evaluation_fixtures), so no database is involved."""

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.employee_repository import get_employee_repository
from app.schemas.table_query import TableQuery
from tests.evaluation_fixtures import matches_query, order_by_query, roster_employee


class _ListingStub:
    """The real repository's paged() mirrored: filter, order, slice."""

    def __init__(self, employees: list[Employee]) -> None:
        self._stored = list(employees)

    async def paged(
        self,
        query: TableQuery,
        page: int,
        page_size: int,
        *,
        review_year: int | None = None,
        statuses: list[str] | None = None,
    ) -> tuple[list[Employee], int]:
        rows = [one for one in self._stored if matches_query(one, query)]
        order_by_query(rows, query)
        offset = (page - 1) * page_size
        return rows[offset : offset + page_size], len(rows)


def make_client(employees: list[Employee]) -> TestClient:
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=["asha_menon@emids.com"],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: _ListingStub(employees)
    return TestClient(app)


def _employees() -> list[Employee]:
    # roster_employee stamps business_unit "Payer Digital"; Asha alone moves
    # to another unit so the filter has exactly one match.
    asha = roster_employee("EMP-V001", "Asha Menon")
    asha.business_unit = "Provider Solutions"
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    bilal.org = "Quality"
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    cara.designation = "Product Manager"
    cara.location = "Pune"
    return [asha, bilal, cara]


def test_the_list_composes_search_filter_and_sort() -> None:
    client = make_client(_employees())

    searched = client.get("/api/employees", params={"search": "product manager"}).json()
    filtered = client.get("/api/employees", params={"org": "Quality"}).json()
    sorted_desc = client.get(
        "/api/employees", params={"sortBy": "employeeName", "sortOrder": "desc"}
    ).json()

    # Search covers the designation, not just the name.
    assert [row["employeeId"] for row in searched["employees"]] == ["EMP-V003"]
    assert [row["employeeId"] for row in filtered["employees"]] == ["EMP-V002"]
    assert [row["employeeId"] for row in sorted_desc["employees"]] == [
        "EMP-V003",
        "EMP-V002",
        "EMP-V001",
    ]
    assert sorted_desc["total"] == 3


def test_the_list_filters_by_business_unit() -> None:
    client = make_client(_employees())

    filtered = client.get("/api/employees", params={"businessUnit": "Provider Solutions"}).json()

    assert [row["employeeId"] for row in filtered["employees"]] == ["EMP-V001"]
    assert filtered["employees"][0]["businessUnit"] == "Provider Solutions"


def test_the_list_rejects_an_unknown_sort_word() -> None:
    client = make_client(_employees())

    response = client.get("/api/employees", params={"sortBy": "salary"})

    # Whitelisted sort words only — validation rejects before any layer runs.
    assert response.status_code == 422
