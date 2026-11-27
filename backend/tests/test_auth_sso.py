"""Entra SSO routes and the session-cookie identity seam, IdP stubbed out.

Pins the wire behavior that matters to the browser: the SSO hand-off ends
with a session cookie carrying the email Entra verified; identity is then
resolved exactly like the stub login — through authenticate_email against
the roster — including the 401 envelope for an off-roster address and the
CSRF state pairing on the callback.
"""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import app.services.sso as sso_service
from app.core import sessions as sessions_module
from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.employee import Employee
from app.repositories.evaluation_repository import get_evaluation_repository
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from app.schemas.employee import ROSTER_ATTRIBUTES

TENANT = "11111111-1111-1111-1111-111111111111"
CLIENT_ID = "22222222-2222-2222-2222-222222222222"
CLIENT_SECRET = "secret-value"
SESSION_SECRET = "unit-test-session-secret"
REDIRECT_URI = "http://localhost:5173/api/auth/sso/callback"


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "database_url": "postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        "stub_admin_emails": [],
        "entra_tenant_id": TENANT,
        "entra_client_id": CLIENT_ID,
        "entra_client_secret": CLIENT_SECRET,
        "sso_redirect_uri": REDIRECT_URI,
        "session_secret": SESSION_SECRET,
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def stored_employee(employee_id: str, email: str, name: str) -> Employee:
    employee = Employee(employee_id=employee_id)
    for _schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, "" if column != "email" else email)
    employee.employee_name = name
    return employee


def make_client(
    stored: list[Employee],
    settings: Settings,
    stub_admin_emails: list[str] | None = None,
) -> TestClient:
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    class _StubEmployeeRepository:
        def __init__(self, rows: list[Employee]) -> None:
            self._lower = {one.email.lower(): one for one in rows}

        async def get_by_email(self, email: str) -> Employee | None:
            return self._lower.get(email.strip().lower())

    app.dependency_overrides[get_employee_repository] = lambda: _StubEmployeeRepository(
        stored
    )
    app.dependency_overrides[get_evaluation_repository] = lambda: None
    app.dependency_overrides[get_review_cycle_repository] = lambda: None
    return TestClient(app)


@pytest.fixture()
def settings() -> Settings:
    return _settings()


@pytest.fixture()
def asha(settings: Settings) -> Employee:
    return stored_employee("EMP-V001", "asha_menon@emids.com", "Asha Menon")


def test_sso_login_redirects_to_entra_planting_the_state_cookie(
    asha: Employee, settings: Settings
) -> None:
    client = make_client([asha], settings)
    response = client.get("/api/auth/sso/login", follow_redirects=False)
    assert response.status_code == 303
    assert response.headers["location"].startswith(
        f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/authorize?"
    )
    assert f"client_id={CLIENT_ID}" in response.headers["location"]
    assert "response_type=code" in response.headers["location"]
    assert "scope=openid" in response.headers["location"]
    cookie = response.headers["set-cookie"]
    assert cookie.startswith("sso_state=")
    assert "HttpOnly" in cookie


def test_callback_exchanges_the_code_into_a_session_cookie(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_redeem(s: Settings, code: str) -> str:
        assert code == "the-code"
        return "the-id-token"

    async def fake_email(s: Settings, id_token: str) -> str:
        return "ASHA_MENON@emids.com"

    monkeypatch.setattr(sso_service, "redeem_sso_code", fake_redeem)
    monkeypatch.setattr(sso_service, "email_from_id_token", fake_email)

    client = make_client([asha], settings)
    response = client.get(
        "/api/auth/sso/callback?code=the-code&state=st",
        cookies={"sso_state": "st"},
        follow_redirects=False,
    )
    assert response.status_code == 303
    assert response.headers["location"] == "http://localhost:5173/"
    cookie = response.headers["set-cookie"]
    assert "pr_session=" in cookie
    assert "HttpOnly" in cookie

    # The cookie alone now resolves the identity: no stub header, no email.
    token = cookie.partition("pr_session=")[2].split(";")[0]
    client.cookies.set("pr_session", token)
    adopted = client.get("/api/auth/session")
    assert adopted.status_code == 200
    assert adopted.json() == {
        "employeeId": "EMP-V001",
        "name": "Asha Menon",
        "email": "asha_menon@emids.com",
        "role": "employee",
    }


def test_callback_maps_the_entra_email_to_the_roster(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_redeem(s: Settings, code: str) -> str:
        return "id-token"

    async def fake_email(s: Settings, id_token: str) -> str:
        return "asha_menon@emids.com"

    monkeypatch.setattr(sso_service, "redeem_sso_code", fake_redeem)
    monkeypatch.setattr(sso_service, "email_from_id_token", fake_email)

    client = make_client([asha], settings)
    adopted = client.get("/api/auth/session")
    assert adopted.status_code == 401

    client.get(
        "/api/auth/sso/callback?code=c&state=st",
        cookies={"sso_state": "st"},
    )
    session = client.get("/api/auth/session")
    assert session.status_code == 200
    assert session.json() == {
        "employeeId": "EMP-V001",
        "name": "Asha Menon",
        "email": "asha_menon@emids.com",
        "role": "employee",
    }


def test_callback_rejects_an_off_roster_entra_email(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_redeem(s: Settings, code: str) -> str:
        return "id-token"

    async def fake_email(s: Settings, id_token: str) -> str:
        return "stranger@emids.com"

    monkeypatch.setattr(sso_service, "redeem_sso_code", fake_redeem)
    monkeypatch.setattr(sso_service, "email_from_id_token", fake_email)

    client = make_client([asha], settings)
    response = client.get(
        "/api/auth/sso/callback?code=c&state=st",
        cookies={"sso_state": "st"},
        follow_redirects=False,
    )
    assert response.status_code == 401
    assert response.json()["code"] == "auth_unknown_email"
    assert "pr_session" not in response.headers.get("set-cookie", "")


def test_callback_refuses_a_mismatched_state(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_redeem(s: Settings, code: str) -> str:
        return "id-token"

    async def fake_email(s: Settings, id_token: str) -> str:
        return "asha_menon@emids.com"

    monkeypatch.setattr(sso_service, "redeem_sso_code", fake_redeem)
    monkeypatch.setattr(sso_service, "email_from_id_token", fake_email)

    client = make_client([asha], settings)
    response = client.get(
        "/api/auth/sso/callback?code=c&state=enemy",
        cookies={"sso_state": "st"},
        follow_redirects=False,
    )
    assert response.status_code == 401
    assert response.json()["code"] == "sso_state_mismatch"
    # No exchange was attempted, no session was planted.
    assert "pr_session" not in response.headers.get("set-cookie", "")


def test_unconfigured_sso_answers_the_501_envelope() -> None:
    settings = _settings(
        entra_tenant_id="", entra_client_secret="", session_secret=""
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_employee_repository] = lambda: None
    app.dependency_overrides[get_evaluation_repository] = lambda: None
    app.dependency_overrides[get_review_cycle_repository] = lambda: None
    client = TestClient(app)
    response = client.get("/api/auth/sso/login")
    assert response.status_code == 501
    assert response.json()["code"] == "sso_not_configured"


def test_logout_clears_the_session_cookie(settings: Settings) -> None:
    client = make_client([], settings)
    token = sessions_module.issue_session("nobody@emids.com", SESSION_SECRET)
    client.cookies.set("pr_session", token)
    response = client.post("/api/auth/logout")
    assert response.status_code == 204
    assert "Max-Age=0" in response.headers["set-cookie"]
    # The pre-logout token stops being accepted, too: identities are read
    # fresh from the cookie jar each request, never remembered server-side.
    holder = make_client([], settings)
    holder.cookies.set("pr_session", token)
    assert holder.get("/api/evaluations/me").status_code == 401


def test_session_codec_round_trip_and_tampering(settings: Settings) -> None:
    token = sessions_module.issue_session("someone@emids.com", SESSION_SECRET)
    assert sessions_module.read_session(token, SESSION_SECRET) == "someone@emids.com"
    assert sessions_module.read_session(token, "wrong-secret") is None
    assert sessions_module.read_session(token.replace("a", "b"), SESSION_SECRET) is None
    assert sessions_module.read_session("", SESSION_SECRET) is None


def test_prod_settings_demand_the_sso_values() -> None:
    with pytest.raises(ValidationError):
        _settings(environment="prod", entra_client_secret="")  # type: ignore[arg-type]

    bundled = _settings(environment="prod")
    assert bundled.environment == "prod"
    assert bundled.session_secret != ""


def _sign_in_through_sso(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> int:
    async def fake_redeem(s: Settings, code: str) -> str:
        return "id-token"

    async def fake_email(s: Settings, id_token: str) -> str:
        return "asha_menon@emids.com"

    monkeypatch.setattr(sso_service, "redeem_sso_code", fake_redeem)
    monkeypatch.setattr(sso_service, "email_from_id_token", fake_email)
    response = client.get(
        "/api/auth/sso/callback?code=c&state=st",
        cookies={"sso_state": "st"},
        follow_redirects=False,
    )
    return response.status_code


def test_callback_refuses_an_inactive_employee(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    asha.employment_status = "Inactive"
    client = make_client([asha], settings)

    assert _sign_in_through_sso(client, monkeypatch) == 403
    assert "pr_session" not in client.cookies
    assert client.get("/api/auth/session").status_code == 401


def test_deactivation_revokes_an_existing_session_cookie(
    asha: Employee, settings: Settings, monkeypatch: pytest.MonkeyPatch
) -> None:
    client = make_client([asha], settings)
    assert _sign_in_through_sso(client, monkeypatch) == 303
    assert client.get("/api/auth/session").status_code == 200

    # HR flips the row to Inactive; the very next request re-reads it.
    asha.employment_status = "Inactive"
    refused = client.get("/api/auth/session")
    assert refused.status_code == 403
    assert refused.json()["code"] == "employee_inactive"
