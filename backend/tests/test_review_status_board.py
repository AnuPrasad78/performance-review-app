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
