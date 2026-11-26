"""One employee's roster write.

PATCH /api/employees/{id} is the admin's single-employee edit — the Status
column's Active/Inactive flip and the profile card's field form both send a
subset of the roster record. Validation lives here, not in the route: the
employee must exist, the identities (employee id, email) must stay unique
across the roster and non-blank, and a primary-key move travels through the
one write the repository owns.
"""

from app.core.errors import AppError
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import ROSTER_ATTRIBUTES, EmployeePatch

# ROSTER_ATTRIBUTES diffs the import flow; the patch reuses the same
# (wire field -> employees column) table so a new roster column is editable
# by editing that one contract.
_PATCH_COLUMNS = dict(ROSTER_ATTRIBUTES)
_IDENTITY_FIELDS = ("employee_id", "name", "email")


async def patch_employee(
    employee_id: str,
    patch: EmployeePatch,
    repository: EmployeeRepository,
) -> Employee:
    """Applies the non-None members of `patch` to the stored row and returns
    it. A moved employee_id re-keys the row (evaluation rows follow via
    ON UPDATE CASCADE), so the wire response is how the client learns the
    row's post-write identity."""
    employee = await repository.get(employee_id)
    if employee is None:
        raise AppError(
            "Employee not found in the roster.", code="employee_missing", status_code=404
        )

    employee_id_to = employee_id
    if patch.employee_id is not None:
        employee_id_to = _require_identity(patch.employee_id, "Employee ID", "employee_id_blank")
        if employee_id_to != employee_id:
            clash = await repository.get(employee_id_to)
            if clash is not None:
                raise AppError(
                    f"Employee ID {employee_id_to} already belongs to an employee.",
                    code="employee_id_taken",
                    status_code=409,
                )

    email = None
    if patch.email is not None:
        email = _require_identity(patch.email, "Email", "email_blank")
        owner = await repository.get_by_email(email)
        # The moved row itself is legitimate — the same person case-fixing
        # their address — so anything the lookup returns must be someone else's.
        if owner is not None and owner.employee_id not in (employee_id, employee_id_to):
            raise AppError(
                f"{email} already belongs to another employee.",
                code="email_taken",
                status_code=409,
            )

    if patch.name is not None:
        _require_identity(patch.name, "Name", "name_blank")

    values: dict[str, str] = {}
    for field, column in _PATCH_COLUMNS.items():
        # The identities are not copied verbatim: employee_id rides the write
        # as the re-key, name/e-mail as the trimmed words the guards produced.
        if field == "employee_id":
            continue
        if field == "name" and patch.name is not None:
            values[column] = patch.name.strip()
        elif field == "email" and email is not None:
            values[column] = email
        elif field not in _IDENTITY_FIELDS:
            text = getattr(patch, field, None)
            if text is not None:
                values[column] = text.strip()

    await repository.update_employee(employee, values, employee_id_to=employee_id_to)
    return employee


def _require_identity(text: str, label: str, code: str) -> str:
    """An identity write must survive the trim — a blank Employee ID / email /
    name is not a row the roster can hold."""
    stripped = text.strip()
    if stripped == "":
        raise AppError(f"{label} cannot be blank.", code=code, status_code=422)
    return stripped
