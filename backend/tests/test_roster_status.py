"""The profile card's employment-status write: PATCH /api/employees/{id}.
Repositories are stubbed, so no database is involved."""

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
