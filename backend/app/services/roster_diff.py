"""Documentation of what one roster upload would change — before writing it.

Given a parsed CSV and the stored employees table, the diff splits the upload
into brand-new rows and conflicts (an employee_id that exists already). The
report is returned to the caller without writing anything: the admin decides
per conflict, and only /import/apply commits anything to the database.
"""

from app.models.employee import Employee
from app.repositories.employee_repository import EmployeeRepository
from app.schemas.employee import RosterConflict, RosterEmployeeOut, RosterImportReport
from app.services.roster_import import ParsedRoster
from app.services.roster_mapping import changed_wire_fields, to_row


async def diff_roster(
    parsed: ParsedRoster, repository: EmployeeRepository
) -> RosterImportReport:
    existing = await repository.get_many([row.employee_id for row in parsed.rows])
    conflicts = [_conflict(row, existing[row.employee_id]) for row in parsed.rows if row.employee_id in existing]
    return RosterImportReport(
        imported_count=len(parsed.rows) - len(conflicts),
        duplicates_skipped=parsed.duplicates_skipped,
        conflicts=conflicts,
        employees=parsed.rows,
    )


def _conflict(incoming: RosterEmployeeOut, stored: Employee) -> RosterConflict:
    return RosterConflict(
        employee_id=incoming.employee_id,
        existing=to_row(stored),
        incoming=incoming,
        changed_fields=changed_wire_fields(stored, incoming),
    )
