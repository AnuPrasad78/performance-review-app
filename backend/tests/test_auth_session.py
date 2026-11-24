"""Session login + identity rules, repository stubbed out.

Pins the wire behavior that matters to the frontend: camelCase identity,
consistent 401 envelopes for unknown/missing identity, case-insensitive
address matching, and the admin allow-list living in settings rather than
the roster.
"""

import pytest
from fastapi.testclient import TestClient

from app.core.auth import role_for_email
from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES


def _settings(stub_admin_emails: list[str] | None = None) -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=stub_admin_emails or [],
    )


def stored_employee(employee_id: str, email: str, name: str) -> Employee:
    # Roster columns are required strings at the wire but nullable in storage;
    # only the queried email drives these tests' behavior.
    employee = Employee(employee_id=employee_id)
    for _schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, "" if column != "email" else email)
    employee.employee_name = name
    return employee


def make_client(stored: list[Employee], stub_admin_emails: list[str] | None = None) -> TestClient:
    settings = _settings(stub_admin_emails)
    app = create_app(settings)
    # get_settings is the lru_cache accessor the DI layer uses; without this
    # override the test's settings lose to a process-cached .env read.
    app.dependency_overrides[get_settings] = lambda: settings

    class _StubEmployeeRepository:
        def __init__(self, stored: list[Employee]) -> None:
            self._lower = {one.email.lower(): one for one in stored}

        async def get_by_email(self, email: str) -> Employee | None:
            return self._lower.get(email.strip().lower())

    employee_stub = _StubEmployeeRepository(stored)
    app.dependency_overrides[get_employee_repository] = lambda: employee_stub
    app.dependency_overrides[get_evaluation_repository] = lambda: None
    app.dependency_overrides[get_review_cycle_repository] = lambda: None
    return TestClient(app)


@pytest.fixture()
def asha() -> Employee:
    return stored_employee("EMP-V001", "asha_menon@emids.com", "Asha Menon")


def test_login_returns_camel_case_identity_for_a_rostered_email(asha: Employee) -> None:
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "asha_menon@emids.com"})
    assert response.status_code == 200
    assert response.json() == {
        "employeeId": "EMP-V001",
        "name": "Asha Menon",
        "email": "asha_menon@emids.com",
        "role": "employee",
    }


def test_login_matches_the_address_case_insensitively(asha: Employee) -> None:
    client = make_client([asha])
    response = client.post("/api/auth/session", json={"email": "  ASHA_MENON@Emids.com  "})
    assert response.status_code == 200
    assert response.json()["employeeId"] == "EMP-V001"


def test_unknown_email_is_a_401_envelope() -> None:
    client = make_client([])
    response = client.post("/api/auth/session", json={"email": "nobody@emids.com"})
    assert response.status_code == 401
    assert response.json() == {
        "detail": "This address is not on the review roster.",
        "code": "auth_unknown_email",
    }


def test_allowlisted_email_carries_the_admin_role(asha: Employee) -> None:
    asha.email = "boss@emids.com"
    client = make_client([asha], stub_admin_emails=["boss@emids.com"])
    response = client.post("/api/auth/session", json={"email": "BOSS@emids.com"})
    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_role_rule_is_case_insensitive_and_configuration_only() -> None:
    settings = _settings(stub_admin_emails=["boss@emids.com"])
    assert role_for_email(" BOSS@EMIDS.COM ", settings) == "admin"
    assert role_for_email("asha_menon@emids.com", settings) == "employee"


def test_missing_identity_header_is_a_401_envelope(asha: Employee) -> None:
    client = make_client([asha])
    response = client.get("/api/evaluations/me", headers={"X-Stub-User": "   "})
    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"
