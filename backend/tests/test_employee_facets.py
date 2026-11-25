"""GET /api/employees/facets — the admin tables' filter dropdowns: whole-roster
distinct values per filterable column, behind the admin role gate.
Repositories are stubbed, so no database is involved."""

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.employee_repository import RosterFacetColumns, get_employee_repository

ADMIN_EVERYONE = ["asha_menon@emids.com"]
STUB_FACETS = RosterFacetColumns(
    designations=["Engineering Manager", "Software Engineer"],
    locations=["Bengaluru", "Pune"],
    orgs=["Delivery", "Quality"],
    reporting_managers=["Priya Raghavan"],
    employment_statuses=["Active"],
)


class _FacetStub:
    """Serves facet_values; identity resolution reaches get_by_email first
    (an optional roster identity makes the non-admin case representable)."""

    def __init__(self, facets: RosterFacetColumns, identity_email: str | None) -> None:
        self._facets = facets
        self._identity_email = identity_email

    async def get_by_email(self, email: str) -> Employee | None:
        if self._identity_email is None or email != self._identity_email:
            return None
        employee = Employee(employee_id="EMP-FL1")
        employee.employee_name = "Facet Incognita"
        employee.email = email
        return employee

    async def facet_values(self) -> RosterFacetColumns:
        return self._facets


def make_client(
    stub: _FacetStub, admin_emails: list[str] | None
) -> TestClient:
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=admin_emails or [],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: stub
    return TestClient(app)


def test_facets_carry_the_whole_roster_options() -> None:
    client = make_client(_FacetStub(STUB_FACETS, None), ADMIN_EVERYONE)

    response = client.get("/api/employees/facets", headers={"X-Stub-User": ADMIN_EVERYONE[0]})

    assert response.status_code == 200
    assert response.json() == {
        "designations": ["Engineering Manager", "Software Engineer"],
        "locations": ["Bengaluru", "Pune"],
        "orgs": ["Delivery", "Quality"],
        "reportingManagers": ["Priya Raghavan"],
        "employmentStatuses": ["Active"],
    }


def test_facets_refuse_a_non_admin_identity() -> None:
    # A stored roster member whose address is not in the admin allow-list.
    client = make_client(_FacetStub(STUB_FACETS, ADMIN_EVERYONE[0]), [])

    response = client.get("/api/employees/facets", headers={"X-Stub-User": ADMIN_EVERYONE[0]})

    assert response.status_code == 403
    assert response.json()["code"] == "admin_required"


def test_facets_refuse_an_unauthenticated_request() -> None:
    client = make_client(_FacetStub(STUB_FACETS, None), ADMIN_EVERYONE)

    response = client.get("/api/employees/facets", headers={"X-Stub-User": "   "})

    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"
