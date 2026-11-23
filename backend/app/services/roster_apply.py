"""Committing an admin-reviewed roster upload.

The apply contract is exact: everything the admin saw in the preview and
confirmed arrives in one payload — inserts for the rows nobody had stored yet,
updates for the collisions the admin chose to overwrite (kept rows simply
stay out). One call = one unit of work; a payload writing one more row than
was previewed is refused instead of applied half-and-half.
"""

from app.core.errors import AppError
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import RosterApplyPayload, RosterApplyReport, RosterConflictIds
from app.services.roster_mapping import to_employee


class RosterInsertConflict(AppError):
    """A payload marks an employee as new, but the table already holds one —
    a race between two admins importing the same file."""

    def __init__(self, employee_ids: list[str]) -> None:
        displayed = ", ".join(repr(one_id) for one_id in employee_ids[:5])
        super().__init__(
            f"cannot insert: these employee IDs already exist ({displayed}"
            f"{'…' if len(employee_ids) > 5 else ''}).",
            code="roster_insert_conflict",
            status_code=409,
            payload=RosterConflictIds(employee_ids=employee_ids),
        )


class RosterUpdateMissing(AppError):
    """A payload marks an employee as updatable, but no row carries that ID —
    deleted between the preview and the confirm."""

    def __init__(self, employee_ids: list[str]) -> None:
        displayed = ", ".join(repr(one_id) for one_id in employee_ids[:5])
        super().__init__(
            f"cannot update: these employee IDs no longer exist ({displayed}"
            f"{'…' if len(employee_ids) > 5 else ''}).",
            code="roster_update_missing",
            status_code=409,
            payload=RosterConflictIds(employee_ids=employee_ids),
        )


async def apply_roster(
    payload: RosterApplyPayload, repository: EmployeeRepository
) -> RosterApplyReport:
    insert_ids = [row.employee_id for row in payload.inserts]
    update_ids = [row.employee_id for row in payload.updates]

    stored = await repository.get_many(insert_ids + update_ids)
    if colliding := [one_id for one_id in insert_ids if one_id in stored]:
        raise RosterInsertConflict(colliding)
    if vanished := [one_id for one_id in update_ids if one_id not in stored]:
        raise RosterUpdateMissing(vanished)

    await repository.insert_many([to_employee(row) for row in payload.inserts])
    await repository.update_many([to_employee(row) for row in payload.updates])
    return RosterApplyReport(
        imported_count=len(payload.inserts),
        updated_count=len(payload.updates),
    )
