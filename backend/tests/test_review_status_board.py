"""GET /api/evaluations — the admin review-status board: roster × evaluations
for the current cycle, the six stored statuses, composed search/filters, and
the admin role gate. Repositories are stubbed, so no database is involved."""

import datetime

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
        evaluation(
            "IN_MANAGER_REVIEW",
            employee_id="EMP-V003",
            employee_signed_at=datetime.datetime(
                2027, 1, 10, 14, 30, tzinfo=datetime.timezone.utc
            ),
        ),
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
    # The Submitted date column's data: employee_signed_at of the evaluation,
    # None while the employee still owns the form.
    submitted_dates = {
        entry["employee"]["employeeId"]: entry["submittedAt"] for entry in payload["reviews"]
    }
    assert submitted_dates == {
        "EMP-V001": None,
        "EMP-V002": None,
        "EMP-V003": "2027-01-10",
        "EMP-V004": None,
    }
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


def test_board_filter_narrows_to_the_exact_word_counts_untouched() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    rows = [
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V001"),
        evaluation("MANAGER_EVALUATION_COMPLETED", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara], rows, admin_emails=[ASHA_EMAIL])

    in_progress = (
        client.get(
            "/api/evaluations",
            params={"status": "self_evaluation_in_progress"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()
    final = (
        client.get(
            "/api/evaluations",
            params={"status": "manager_evaluation_completed"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()
    manager_review = (
        client.get(
            "/api/evaluations",
            params={"status": "in_manager_review"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()

    # The word *is* the filter: exactly the rows whose stored status
    # lower-cases to it — each lifecycle stage is its own option now.
    assert [entry["status"] for entry in in_progress["reviews"]] == [
        "self_evaluation_in_progress"
    ]
    assert in_progress["total"] == 1
    assert [entry["status"] for entry in final["reviews"]] == [
        "manager_evaluation_completed"
    ]
    assert final["total"] == 1
    # A stage with no rows answers an empty page, not the next-best bucket.
    assert manager_review["reviews"] == []
    assert manager_review["total"] == 0
    # The status word never narrows the counts — no other filter word is
    # present, so the distribution stays the whole roster.
    assert in_progress["statusCounts"].get("manager_evaluation_completed") == 1
    assert in_progress["statusCounts"]["not_started"] == 1


def test_counts_follow_the_composed_filters_but_not_the_status_word() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")           # org Delivery, no row
    bilal = roster_employee("EMP-V002", "Bilal Khan")          # org Quality
    bilal.org = "Quality"
    cara = roster_employee("EMP-V003", "Cara Fernandes")       # org Delivery
    rows = [
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V002"),
        evaluation("IN_MANAGER_REVIEW", employee_id="EMP-V003"),
    ]
    client = make_board_client([asha, bilal, cara], rows, admin_emails=[ASHA_EMAIL])

    response = (
        client.get(
            "/api/evaluations",
            params={"status": "in_manager_review", "org": "Delivery"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()

    # The table narrows by BOTH words: only Cara satisfies org + status.
    assert [entry["status"] for entry in response["reviews"]] == ["in_manager_review"]
    assert response["total"] == 1
    # The counts narrow by the org filter alone — never the status word, or
    # the pie would collapse to exactly the one color the funnel picked.
    assert response["statusCounts"] == {
        "not_started": 1,
        "in_manager_review": 1,
    }


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


def test_board_search_and_dropdown_filters_compose() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    bilal.org = "Quality"
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    cara.designation = "Product Manager"
    client = make_board_client([asha, bilal, cara], [], admin_emails=[ASHA_EMAIL])

    searched = (
        client.get(
            "/api/evaluations", params={"search": "manager"}, headers={"X-Stub-User": ASHA_EMAIL}
        )
    ).json()
    filtered = (
        client.get("/api/evaluations", params={"org": "Quality"}, headers={"X-Stub-User": ASHA_EMAIL})
    ).json()
    composed = (
        client.get(
            "/api/evaluations",
            params={"search": "manager", "org": "Quality"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()

    # Search reaches the designation; the dropdown matches exactly.
    assert [entry["employee"]["employeeId"] for entry in searched["reviews"]] == ["EMP-V003"]
    assert [entry["employee"]["employeeId"] for entry in filtered["reviews"]] == ["EMP-V002"]
    # Search and filter compose: Cara matches the search but not the org.
    assert composed["reviews"] == []
    assert composed["total"] == 0
    # The counts follow the same composed narrowing (no status word present):
    # the searched org carries Cara alone, the filtered Cara alone, the
    # composed pair — no one.
    assert searched["statusCounts"] == {"not_started": 1}
    assert filtered["statusCounts"] == {"not_started": 1}
    assert composed["statusCounts"] == {}


def test_board_sort_by_status_follows_workflow_rank() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    devika = roster_employee("EMP-V004", "Devika Nair")
    eshan = roster_employee("EMP-V005", "Eshan Gupta")
    faisal = roster_employee("EMP-V006", "Faisal Khan")
    # Six roster rows × five evaluation rows: every lifecycle word exactly
    # once (the never-opened member needs no row at all), so the sort really
    # pins all six rank steps.
    rows = [
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V002"),
        evaluation("SELF_EVALUATION_COMPLETED", employee_id="EMP-V003"),
        evaluation("IN_MANAGER_REVIEW", employee_id="EMP-V004"),
        evaluation("MANAGER_EVALUATION_IN_PROGRESS", employee_id="EMP-V005"),
        evaluation("MANAGER_EVALUATION_COMPLETED", employee_id="EMP-V006"),
    ]
    client = make_board_client([asha, bilal, cara, devika, eshan, faisal], rows, admin_emails=[ASHA_EMAIL])

    ascending = (
        client.get(
            "/api/evaluations", params={"sortBy": "status"}, headers={"X-Stub-User": ASHA_EMAIL}
        )
    ).json()
    descending = (
        client.get(
            "/api/evaluations",
            params={"sortBy": "status", "sortOrder": "desc"},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
    ).json()

    # Workflow order — the lifecycle rank (not started first, manager
    # evaluation completed last), never the words' alphabetical accident.
    # The full ladder is exercised so every rank step stays pinned.
    assert [entry["status"] for entry in ascending["reviews"]] == [
        "not_started",
        "self_evaluation_in_progress",
        "self_evaluation_completed",
        "in_manager_review",
        "manager_evaluation_in_progress",
        "manager_evaluation_completed",
    ]
    assert [entry["status"] for entry in descending["reviews"]] == [
        "manager_evaluation_completed",
        "manager_evaluation_in_progress",
        "in_manager_review",
        "self_evaluation_completed",
        "self_evaluation_in_progress",
        "not_started",
    ]


def test_board_rejects_an_unknown_sort_word() -> None:
    asha = roster_employee()
    client = make_board_client([asha], [], admin_emails=[ASHA_EMAIL])

    response = client.get(
        "/api/evaluations", params={"sortBy": "password.hash"}, headers={"X-Stub-User": ASHA_EMAIL}
    )

    # Whitelisted sort words only — validation rejects before any layer runs.
    assert response.status_code == 422


def test_board_sort_by_submitted_date_keeps_unsigned_rows_last() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    cara = roster_employee("EMP-V003", "Cara Fernandes")
    devika = roster_employee("EMP-V004", "Devika Nair")
    utc = datetime.timezone.utc
    rows = [
        evaluation(
            "SELF_EVALUATION_COMPLETED",
            employee_id="EMP-V002",
            employee_signed_at=datetime.datetime(2026, 3, 5, tzinfo=utc),
        ),
        evaluation(
            "IN_MANAGER_REVIEW",
            employee_id="EMP-V003",
            employee_signed_at=datetime.datetime(2026, 1, 20, tzinfo=utc),
        ),
        evaluation("SELF_EVALUATION_IN_PROGRESS", employee_id="EMP-V004"),
    ]
    client = make_board_client([asha, bilal, cara, devika], rows, admin_emails=[ASHA_EMAIL])

    def names(order: str) -> list[str]:
        response = client.get(
            "/api/evaluations",
            params={"sortBy": "submittedAt", "sortOrder": order},
            headers={"X-Stub-User": ASHA_EMAIL},
        )
        assert response.status_code == 200
        return [entry["employee"]["name"] for entry in response.json()["reviews"]]

    # Signed rows by date; the two unsigned rows trail (name order) both ways.
    assert names("asc") == ["Cara Fernandes", "Bilal Khan", "Asha Menon", "Devika Nair"]
    assert names("desc") == ["Bilal Khan", "Cara Fernandes", "Asha Menon", "Devika Nair"]


def test_submitted_date_sort_orders_by_sign_off_with_nulls_last_in_sql() -> None:
    from sqlalchemy.dialects import postgresql

    from app.repositories.employee_repository import _board_status, _roster_order
    from app.schemas.table_query import TableQuery

    for order in ("asc", "desc"):
        query = TableQuery(sort_by="submittedAt", sort_order=order)
        lead = _roster_order(query, status_word=_board_status())[0]
        sql = str(lead.compile(dialect=postgresql.dialect()))
        assert sql == f"evaluations.employee_signed_at {order.upper()} NULLS LAST"


def test_board_accepts_every_upload_field_as_a_sort_word() -> None:
    asha = roster_employee()
    client = make_board_client([asha], [], admin_emails=[ASHA_EMAIL])
    for word in (
        "employeeId",
        "designation",
        "businessUnit",
        "project",
        "deliveryHead",
        "deliveryManager",
        "businessPartner",
        "employmentStatus",
        "joiningDate",
    ):
        response = client.get(
            "/api/evaluations", params={"sortBy": word}, headers={"X-Stub-User": ASHA_EMAIL}
        )
        assert response.status_code == 200, word


def test_joining_date_sort_keeps_blank_dates_last_in_sql() -> None:
    from sqlalchemy.dialects import postgresql

    from app.repositories.employee_repository import _board_status, _roster_order
    from app.schemas.table_query import TableQuery

    for order in ("asc", "desc"):
        lead = _roster_order(TableQuery(sort_by="joiningDate", sort_order=order), _board_status())[0]
        sql = str(lead.compile(dialect=postgresql.dialect()))
        assert sql == f"employees.joining_date {order.upper()} NULLS LAST"
    plain = _roster_order(TableQuery(sort_by="deliveryHead", sort_order="desc"), _board_status())[0]
    assert str(plain.compile(dialect=postgresql.dialect())) == "employees.delivery_head DESC"
