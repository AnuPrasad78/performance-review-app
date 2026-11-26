"""One employee's roster write: PATCH /api/employees/{id} — the Status
column's flip and the edit form's field save; repositories are stubbed, so
no database is involved."""

from tests.evaluation_fixtures import make_board_client, roster_employee

ADMIN_EMAIL = "hr_admin@emids.com"


def patch(client: object, employee_id: str, body: dict, email: str) -> object:
    return client.patch(
        f"/api/employees/{employee_id}", json=body, headers={"X-Stub-User": email}
    )


def test_patch_flips_the_stored_word_and_serves_the_row() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    response = patch(
        client,
        "EMP-V001",
        {"status": "Inactive"},
        ADMIN_EMAIL,
    )

    assert response.status_code == 200
    assert response.json()["status"] == "Inactive"
    assert worker.employment_status == "Inactive"

    # The flip works both ways: back to Active.
    restore = patch(client, "EMP-V001", {"status": "Active"}, ADMIN_EMAIL)
    assert restore.json()["status"] == "Active"
    assert worker.employment_status == "Active"


def test_patch_updates_one_field_and_leaves_the_others_alone() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    worker.designation = "Software Engineer"
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    response = patch(
        client, "EMP-V001", {"designation": " Product Manager "}, ADMIN_EMAIL
    )

    assert response.status_code == 200
    assert response.json()["designation"] == "Product Manager"
    assert worker.employment_status == "Active"
    assert worker.employee_name == "Asha Menon"


def test_patch_writes_the_edit_form_fields() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])
    body = {
        "name": "Asha Menon Rao",
        "email": "asha_menon_rao@emids.com",
        "designation": "Product Manager",
        "location": "Singapore",
        "org": "Quality",
        "businessUnit": "Provider Solutions",
        "project": "Medicaid Suite",
        "deliveryHead": "Arumugam Thiraviam",
        "deliveryManager": "Priya Raghavan",
        "businessPartner": "Jane Roe",
        "reportingManager": "Ravi Kumar",
        "status": "Inactive",
    }

    response = patch(client, "EMP-V001", body, ADMIN_EMAIL)

    assert response.status_code == 200
    assert response.json()["name"] == "Asha Menon Rao"
    assert response.json()["email"] == "asha_menon_rao@emids.com"
    for wire, column in (
        ("designation", "designation"),
        ("location", "location"),
        ("org", "org"),
        ("businessUnit", "business_unit"),
        ("project", "current_account_project"),
        ("deliveryHead", "delivery_head"),
        ("deliveryManager", "delivery_manager"),
        ("businessPartner", "business_partner"),
        ("reportingManager", "reporting_manager"),
    ):
        assert getattr(worker, column) == body[wire]
    assert worker.employment_status == "Inactive"


def test_patch_moves_the_employee_id() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    response = patch(client, "EMP-V001", {"employeeId": "EMP-V999"}, ADMIN_EMAIL)

    assert response.status_code == 200
    assert response.json()["employeeId"] == "EMP-V999"
    # The roster now serves the row under its new ID only.
    assert worker.employee_id == "EMP-V999"


def test_patch_rejects_identities_another_row_owns() -> None:
    asha = roster_employee("EMP-V001", "Asha Menon")
    bilal = roster_employee("EMP-V002", "Bilal Khan")
    client = make_board_client([asha, bilal], [], admin_emails=[ADMIN_EMAIL])

    taken_id = patch(client, "EMP-V002", {"employeeId": "EMP-V001"}, ADMIN_EMAIL)
    taken_email = patch(
        client, "EMP-V002", {"email": "asha_menon@emids.com"}, ADMIN_EMAIL
    )

    assert taken_id.status_code == 409
    assert taken_id.json()["code"] == "employee_id_taken"
    assert taken_email.status_code == 409
    assert taken_email.json()["code"] == "email_taken"


def test_patch_accepts_the_owner_s_own_email_back() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    same = patch(client, "EMP-V001", {"email": "asha_menon@emids.com"}, ADMIN_EMAIL)

    assert same.status_code == 200
    assert worker.email == "asha_menon@emids.com"


def test_patch_rejects_blank_identities() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    blank_id = patch(client, "EMP-V001", {"employeeId": "   "}, ADMIN_EMAIL)
    blank_email = patch(client, "EMP-V001", {"email": ""}, ADMIN_EMAIL)
    blank_name = patch(client, "EMP-V001", {"name": " "}, ADMIN_EMAIL)

    assert blank_id.status_code == 422
    assert blank_id.json()["code"] == "employee_id_blank"
    assert blank_email.status_code == 422
    assert blank_email.json()["code"] == "email_blank"
    assert blank_name.status_code == 422
    assert blank_name.json()["code"] == "name_blank"


def test_patch_rejects_unknown_employees_and_words() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    missing = patch(client, "EMP-NOPE", {"status": "Active"}, ADMIN_EMAIL)
    bad_word = patch(client, "EMP-V001", {"status": "Retired"}, ADMIN_EMAIL)

    assert missing.status_code == 404
    assert missing.json()["code"] == "employee_missing"
    assert bad_word.status_code == 422


def test_patch_demands_the_admin_role() -> None:
    worker = roster_employee("EMP-V001", "Asha Menon")
    client = make_board_client([worker], [], admin_emails=[ADMIN_EMAIL])

    member = patch(
        client, "EMP-V001", {"status": "Inactive"}, worker.email
    )

    assert member.status_code == 403
    assert member.json()["code"] == "admin_required"
