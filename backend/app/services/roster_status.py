"""One employee's employment-status write.

The profile card's Active/Inactive flip is a single-field roster edit with
its own guardrails — add rows only here: the employee must exist and the
wire word must be one of the CSV's two, both settled by the schema; the
service turns a missing row into the 404 envelope the client's toast renders.
"""

from app.core.errors import AppError
from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import EmployeeStatusPatch


async def set_employment_status(
    employee_id: str,
    patch: EmployeeStatusPatch,
    repository: EmployeeRepository,
) -> Employee:
    employee = await repository.set_employment_status(employee_id, patch.status)
    if employee is None:
        raise AppError(
            "Employee not found in the roster.", code="employee_missing", status_code=404
        )
    return employee
