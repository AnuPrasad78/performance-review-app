"""GET/PUT /api/cycle-settings contract: admin-only access, friendly date
order errors, and the upsert-by-review-year behavior (new year becomes the
cycle employees answer into). Repositories are stubbed, so no database is
involved."""

import datetime

from fastapi.testclient import TestClient

from app.core.config import Settings, get_settings
from app.main import create_app
from app.models.review_cycle import ReviewCycle
from app.repositories.employee_repository import get_employee_repository
from app.repositories.review_cycle_repository import get_review_cycle_repository
from tests.evaluation_fixtures import _RosterRepository, roster_employee

UTC = datetime.timezone.utc

ADMIN = {"X-Stub-User": "console.admin@emids.com"}
EMPLOYEE = {"X-Stub-User": "asha_menon@emids.com"}

VALID_SETTINGS = {
    "reviewYear": 2026,
    "submissionDeadline": "2027-01-15T10:00:00+00:00",
    "managerReviewStart": "2027-01-16",
    "managerReviewEnd": "2027-02-15",
    "hrApprovalReleaseBy": "2027-03-01",
}


def stored_cycle(
    review_year: int,
    deadline: datetime.datetime,
    eligibility: datetime.date | None = None,
) -> ReviewCycle:
    return ReviewCycle(
        review_year=review_year,
        submission_deadline=deadline,
        manager_review_start=deadline.date() + datetime.timedelta(days=1),
        manager_review_end=deadline.date() + datetime.timedelta(days=30),
        hr_approval_release_by=deadline.date() + datetime.timedelta(days=45),
        employee_eligibility_date=eligibility,
    )


class MutableCycleRepository:
    """find-then-update-or-add is the service's upsert contract: existing rows
    are mutated in place (nothing new enters the collection on update)."""

    def __init__(self, cycles: list[ReviewCycle]) -> None:
        self.cycles = list(cycles)

    async def current(self) -> ReviewCycle | None:
        return max(self.cycles, key=lambda cycle: cycle.review_year, default=None)

    async def find_by_year(self, review_year: int) -> ReviewCycle | None:
        return next(
            (cycle for cycle in self.cycles if cycle.review_year == review_year),
            None,
        )

    async def add(self, cycle: ReviewCycle) -> None:
        self.cycles.append(cycle)


def make_client(cycles: list[ReviewCycle]) -> tuple[TestClient, MutableCycleRepository]:
    """The auth dependency resolves every identity against the roster, so the
    employee stub comes along too — one rostered employee sits next to the
    allow-listed admin identity so both 403/200 paths are reachable."""
    settings = Settings(
        database_url="postgresql+asyncpg://ignored:ignored@localhost:5432/ignored",
        stub_admin_emails=["console.admin@emids.com"],
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    # _RosterRepository matches the address instead of returning its row for
    # every lookup, so the off-roster admin identity stays off-roster here.
    app.dependency_overrides[get_employee_repository] = lambda: _RosterRepository(
        [roster_employee()]
    )
    cycles_stub = MutableCycleRepository(cycles)
    app.dependency_overrides[get_review_cycle_repository] = lambda: cycles_stub
    return TestClient(app), cycles_stub


def test_get_returns_the_current_cycle_admin_facing() -> None:
    client, _ = make_client([stored_cycle(2026, datetime.datetime(2027, 1, 15, 10, 0, tzinfo=UTC))])

    response = client.get("/api/cycle-settings", headers=ADMIN)

    assert response.status_code == 200
    payload = response.json()
    assert payload["reviewYear"] == 2026
    assert payload["submissionDeadline"].startswith("2027-01-15T10:00:00")
    assert payload["managerReviewStart"] == "2027-01-16"
    assert payload["hrApprovalReleaseBy"] == "2027-03-01"


def test_get_is_a_404_envelope_when_no_cycle_exists() -> None:
    client, _ = make_client([])

    response = client.get("/api/cycle-settings", headers=ADMIN)

    assert response.status_code == 404
    assert response.json()["code"] == "cycle_missing"


def test_get_serves_the_eligibility_date_verbatim_and_null_when_unset() -> None:
    eligible_cycle = stored_cycle(
        2026,
        datetime.datetime(2027, 1, 15, 10, 0, tzinfo=UTC),
        eligibility=datetime.date(2026, 9, 30),
    )
    client, _ = make_client([eligible_cycle])

    response = client.get("/api/cycle-settings", headers=ADMIN)

    assert response.status_code == 200
    assert response.json()["employeeEligibilityDate"] == "2026-09-30"

    unset_client, _ = make_client(
        [stored_cycle(2026, datetime.datetime(2027, 1, 15, 10, 0, tzinfo=UTC))]
    )
    assert unset_client.get("/api/cycle-settings", headers=ADMIN).json()[
        "employeeEligibilityDate"
    ] is None


def test_put_writes_the_eligibility_date_and_blank_clears_it() -> None:
    client, cycles = make_client(
        [stored_cycle(2026, datetime.datetime(2027, 1, 1, 10, 0, tzinfo=UTC))]
    )

    response = client.put(
        "/api/cycle-settings", json=dict(VALID_SETTINGS, employeeEligibilityDate="2026-06-30"),
        headers=ADMIN,
    )
    assert response.status_code == 200
    assert response.json()["employeeEligibilityDate"] == "2026-06-30"
    assert cycles.cycles[0].employee_eligibility_date == datetime.date(2026, 6, 30)

    cleared = dict(VALID_SETTINGS, employeeEligibilityDate="")
    cleared_response = client.put("/api/cycle-settings", json=cleared, headers=ADMIN)
    assert cleared_response.status_code == 200
    assert cleared_response.json()["employeeEligibilityDate"] is None
    assert cycles.cycles[0].employee_eligibility_date is None


def test_put_updates_the_existing_year_in_place() -> None:
    client, cycles = make_client([stored_cycle(2026, datetime.datetime(2027, 1, 1, 10, 0, tzinfo=UTC))])

    response = client.put("/api/cycle-settings", json=VALID_SETTINGS, headers=ADMIN)

    assert response.status_code == 200
    assert len(cycles.cycles) == 1
    assert cycles.cycles[0].submission_deadline == datetime.datetime(2027, 1, 15, 10, 0, tzinfo=UTC)


def test_put_creates_a_cycle_for_a_year_that_does_not_exist() -> None:
    client, cycles = make_client([])

    response = client.put("/api/cycle-settings", json=VALID_SETTINGS, headers=ADMIN)

    assert response.status_code == 200
    assert len(cycles.cycles) == 1
    assert cycles.cycles[0].review_year == 2026
    # The published year is what every employee-facing read reports back.
    assert response.json()["reviewYear"] == 2026


def test_put_rejects_the_deadline_after_the_manager_window_opens() -> None:
    late_deadline = dict(
        VALID_SETTINGS, submissionDeadline="2027-01-20T10:00:00+00:00"
    )
    client, cycles = make_client([stored_cycle(2026, datetime.datetime(2027, 1, 1, 10, 0, tzinfo=UTC))])

    response = client.put("/api/cycle-settings", json=late_deadline, headers=ADMIN)

    assert response.status_code == 400
    assert response.json()["code"] == "date_order_error"
    assert "manager review start" in response.json()["detail"]
    # Nothing half-written: the stored row keeps its original deadline.
    assert cycles.cycles[0].submission_deadline == datetime.datetime(2027, 1, 1, 10, 0, tzinfo=UTC)


def test_put_requires_a_deadline_with_an_offset() -> None:
    naive = dict(VALID_SETTINGS, submissionDeadline="2027-01-15T10:00:00")
    client, _ = make_client([])

    response = client.put("/api/cycle-settings", json=naive, headers=ADMIN)

    assert response.status_code == 422


def test_settings_routes_reject_a_non_admin_identity() -> None:
    client, _ = make_client([stored_cycle(2026, datetime.datetime(2027, 1, 15, 10, 0, tzinfo=UTC))])

    get_response = client.get("/api/cycle-settings", headers=EMPLOYEE)
    put_response = client.put(
        "/api/cycle-settings", json=VALID_SETTINGS, headers=EMPLOYEE
    )

    assert get_response.status_code == 403
    assert put_response.status_code == 403
    assert get_response.json()["code"] == "admin_required"
    assert put_response.json()["code"] == "admin_required"
