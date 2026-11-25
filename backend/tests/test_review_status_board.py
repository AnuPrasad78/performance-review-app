"""GET /api/evaluations — the admin review-status board: roster × evaluations
for the current cycle, the six stored statuses, and the admin role gate.
Repositories are stubbed, so no database is involved."""

from tests.evaluation_fixtures import (
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
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V001"),
        evaluation("NOT_STARTED", employee_id="EMP-V002"),
        evaluation("IN_MANAGER_REVIEW", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara, devika], rows, admin_emails=[ASHA_EMAIL])

    response = board_response(client, ASHA_EMAIL)

    assert response.status_code == 200
    payload = response.json()
    statuses = {entry["employee"]["employeeId"]: entry["status"] for entry in payload["reviews"]}
    assert statuses == {
        "EMP-V001": "self_evaluation_in_progress",  # the stored word, in wire form
        "EMP-V002": "not_started",  # opened, nothing saved yet
        "EMP-V003": "in_manager_review",
        "EMP-V004": "not_started",  # no evaluation row at all
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
        "self_evaluation_in_progress": 1,
        "in_manager_review": 1,
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
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V001"),
        evaluation("MANAGER_EVALUATION_COMPLETED", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara], rows, admin_emails=[ASHA_EMAIL])

    pending = (
        client.get("/api/evaluations", params={"status": "pending"}, headers={"X-Stub-User": ASHA_EMAIL})
    ).json()
    completed = (
        client.get("/api/evaluations", params={"status": "completed"}, headers={"X-Stub-User": ASHA_EMAIL})
    ).json()

    # Pending = the employee still owns the review: an in-progress form and
    # a roster row without any evaluation both qualify.
    assert [entry["status"] for entry in pending["reviews"]] == [
        "self_evaluation_in_progress",
        "not_started",
    ]
    assert pending["total"] == 2
    # Counts stay whole-roster whatever the filter narrows.
    assert pending["statusCounts"].get("manager_evaluation_completed") == 1
    assert [entry["status"] for entry in completed["reviews"]] == ["manager_evaluation_completed"]
    assert completed["total"] == 1
    assert completed["statusCounts"]["not_started"] == 1


def test_manager_phase_words_render_verbatim() -> None:
    # The stored status is the whole rule: every lifecycle word the column
    # allows reaches the board as its own wire word — no bucketing server-side.
    reflect = roster_employee("EMP-V001", "Asha Menon")
    reflect.email = ASHA_EMAIL
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    bilal.email = "bilal_khan@emids.com"
    rows = [
        evaluation(
            "MANAGER_EVALUATION_IN_PROGRESS",
            employee_id="EMP-V001",
            manager_started_at="2027-01-20 09:00:00+00:00",
        ),
        evaluation("SELF_EVALUATION_COMPLETED", employee_id="EMP-V002"),
    ]
    client = make_board_client([reflect, bilal], rows, admin_emails=[ASHA_EMAIL])

    statuses = {
        entry["employee"]["employeeId"].split("-")[1]: entry["status"]
        for entry in board_response(client, ASHA_EMAIL).json()["reviews"]
    }

    assert statuses["V001"] == "manager_evaluation_in_progress"
    assert statuses["V002"] == "self_evaluation_completed"


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