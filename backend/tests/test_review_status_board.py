"""GET /api/evaluations — the admin review-status board: roster × evaluations
for the current cycle, the four derived statuses, and the admin role gate.
Repositories are stubbed, so no database is involved."""

from tests.evaluation_fixtures import (
    CYCLE,
    evaluation,
    make_board_client,
    roster_employee,
)

ASHA_EMAIL = "asha_menon@emids.com"


def board_response(client: object, identity: str) -> object:
    return client.get("/api/evaluations", headers={"X-Stub-User": identity})


def test_board_joins_roster_rows_with_evaluation_states() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    devika = roster_employee("EMP-V004", "Devika Nair")
    rows = [
        evaluation("IN_PROGRESS", employee_id="EMP-V001", q1_employee_response="An answer."),
        evaluation("IN_PROGRESS", employee_id="EMP-V002"),
        evaluation("SUBMITTED", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara, devika], rows, admin_emails=[ASHA_EMAIL])

    response = board_response(client, ASHA_EMAIL)

    assert response.status_code == 200
    payload = response.json()
    statuses = {entry["employee"]["employeeId"]: entry["status"] for entry in payload["reviews"]}
    assert statuses == {
        "EMP-V001": "in_progress",  # started: an answer exists
        "EMP-V002": "not_started",  # open row with nothing in it
        "EMP-V003": "submitted",
        "EMP-V004": "not_started",  # roster-only: no evaluation row at all
    }
    # Roster order drives the board, not evaluation-row order.
    assert [entry["employee"]["employeeId"] for entry in payload["reviews"]] == [
        "EMP-V001",
        "EMP-V002",
        "EMP-V003",
        "EMP-V004",
    ]
    # The whole-roster distribution rides along for the tiles and pie.
    assert payload["total"] == 4
    assert payload["page"] == 1
    assert payload["pageSize"] == 10
    assert payload["statusCounts"] == {
        "not_started": 2,
        "in_progress": 1,
        "submitted": 1,
    }


def test_board_pages_the_roster_in_roster_order() -> None:
    members = [
        roster_employee("EMP-V001", "Asha Menon"),
        roster_employee("EMP-V002", "Bilal Khan"),
        roster_employee("EMP-V003", "Cara Fernandes"),
        roster_employee("EMP-V004", "Devika Nair"),
        roster_employee("EMP-V005", "Eshan Gupta"),
    ]
    client = make_board_client(members, [], admin_emails=[ASHA_EMAIL])

    second_page = (
        client.get(
            "/api/evaluations",
            params={"page": 2, "pageSize": 2},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()

    assert second_page["total"] == 5
    assert second_page["page"] == 2
    assert second_page["pageSize"] == 2
    assert [entry["employee"]["employeeId"] for entry in second_page["reviews"]] == [
        "EMP-V003",
        "EMP-V004",
    ]
    # Counts cover the whole roster, not the page.
    assert second_page["statusCounts"]["not_started"] == 5


def test_board_filter_narrows_rows_and_total_not_counts() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    rows = [
        evaluation("IN_PROGRESS", employee_id="EMP-V001", q1_employee_response="An answer."),
        evaluation("SUBMITTED", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara], rows, admin_emails=[ASHA_EMAIL])

    pending = (
        client.get("/api/evaluations", params={"status": "pending"}, headers={"X-Stub-User": ASHA_EMAIL})
    ).json()
    completed = (
        client.get("/api/evaluations", params={"status": "completed"}, headers={"X-Stub-User": ASHA_EMAIL})
    ).json()

    assert [entry["status"] for entry in pending["reviews"]] == ["in_progress", "not_started"]
    assert pending["total"] == 2
    assert pending["statusCounts"]["submitted"] == 1
    assert [entry["status"] for entry in completed["reviews"]] == ["submitted"]
    assert completed["total"] == 1
    assert completed["statusCounts"]["not_started"] == 1


def test_employee_signature_means_signed_off() -> None:
    reflect = roster_employee("EMP-V001", "Asha Menon")
    reflect.email = ASHA_EMAIL
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    bilal.email = "bilal_khan@emids.com"
    rows = [
        evaluation(
            "COMPLETED",
            employee_id="EMP-V001",
            employee_signed_at="2026-12-01 10:00:00+00:00",
        ),
        evaluation("REOPENED", employee_id="EMP-V002"),
    ]
    client = make_board_client([reflect, bilal], rows, admin_emails=[ASHA_EMAIL])

    statuses = {
        entry["employee"]["employeeId"].split("-")[1]: entry["status"]
        for entry in board_response(client, ASHA_EMAIL).json()["reviews"]
    }

    # signed_off is the employee signature's own view; REOPENED without a
    # signature still freezes the employee, so it reads as submitted.
    assert statuses["V001"] == "signed_off"
    assert statuses["V002"] == "submitted"


def test_the_board_refuses_a_non_admin_identity() -> None:
    asha = roster_employee()
    client = make_board_client([asha], [], admin_emails=[])

    response = board_response(client, ASHA_EMAIL)

    assert response.status_code == 403
    assert response.json()["code"] == "admin_required"


def test_the_board_refuses_an_unauthenticated_request() -> None:
    asha = roster_employee()
    client = make_board_client([asha], [], admin_emails=[ASHA_EMAIL])

    response = client.get("/api/evaluations", headers={"X-Stub-User": "   "})

    assert response.status_code == 401
    assert response.json()["code"] == "auth_required"


def test_board_needs_a_cycle_to_sit_on() -> None:
    asha = roster_employee()
    asha.email = ASHA_EMAIL
    client = make_board_client([asha], [], cycle=None, admin_emails=[ASHA_EMAIL])

    response = board_response(client, ASHA_EMAIL)

    assert response.status_code == 404
    assert response.json()["code"] == "cycle_missing"
