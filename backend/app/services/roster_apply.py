"""Committing an admin-reviewed roster upload.

The apply contract is exact: everything the admin saw in the preview and
confirmed arrives in one payload — inserts for the rows nobody had stored yet,
updates for the collisions the admin chose to overwrite (kept rows simply
stay out). Rows match stored employees by email identity, case-insensitive;
the upload may also move an updated row's employee_id — the CSV value becomes
the record's new PK, and evaluations follow through the FK's ON UPDATE
CASCADE. One call = one unit of work; a payload writing one more row than was
previewed is refused instead of applied half-and-half.
"""

from app.core.errors import AppError
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import (
    RosterApplyPayload,
    RosterApplyReport,
    RosterConflictEmails,
    RosterEmployeeOut,
)
from app.services.roster_mapping import to_employee


class RosterInsertConflict(AppError):
    """A payload marks an email as new, but the table already holds it —
    a race between two admins importing the same file."""

    def __init__(self, emails: list[str]) -> None:
        displayed = ", ".join(repr(email) for email in emails[:5])
        super().__init__(
            f"cannot insert: these emails already exist ({displayed}"
            f"{'…' if len(emails) > 5 else ''}).",
            code="roster_insert_conflict",
            status_code=409,
            payload=RosterConflictEmails(emails=emails),
        )


class RosterUpdateMissing(AppError):
    """A payload marks an email as updatable, but no row carries it — deleted
    between the preview and the confirm."""

    def __init__(self, emails: list[str]) -> None:
        displayed = ", ".join(repr(email) for email in emails[:5])
        super().__init__(
            f"cannot update: these emails no longer exist ({displayed}"
            f"{'…' if len(emails) > 5 else ''}).",
            code="roster_update_missing",
            status_code=409,
            payload=RosterConflictEmails(emails=emails),
        )


async def apply_roster(
    payload: RosterApplyPayload, repository: EmployeeRepository
) -> RosterApplyReport:
    # The wire payload's emails arrive as typed, the stored side is keyed
    # lower-cased: every identity read below compares after lowering.
    stored = await repository.get_many_by_email(
        [row.email for row in payload.inserts + payload.updates if row.email]
    )
    insert_emails = [row.email.lower() for row in payload.inserts]
    update_emails = [row.email.lower() for row in payload.updates]
    if colliding := [email for email in insert_emails if email in stored]:
        raise RosterInsertConflict(colliding)
    if vanished := [email for email in update_emails if email not in stored]:
        raise RosterUpdateMissing(vanished)

    await repository.insert_many([to_employee(row) for row in payload.inserts])
    await repository.update_many(
        [
            (stored[row.email.lower()].employee_id, to_employee(row))
            for row in payload.updates
        ]
    )
    return RosterApplyReport(
        imported_count=len(payload.inserts),
        updated_count=len(payload.updates),
    )
