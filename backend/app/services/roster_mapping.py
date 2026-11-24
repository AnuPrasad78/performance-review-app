"""Translation between the roster CSV contract (RosterEmployeeOut) and the
employees table (Employee).

The name correspondences live in schemas.employee.ROSTER_ATTRIBUTES so every
layer can share them without reaching into models; this module adds the
object-level operations (build a model from a row, copy a row over a model,
rebuild a row from a model, diff a row against a model).

The `project` CSV column is stored as `current_account_project` because that
is the name the human roster owner uses; the schema field stays `project` so
the upstream CSV header can be matched verbatim.
"""

from pydantic.alias_generators import to_camel

from app.models.employee import Employee
from app.schemas.employee import ROSTER_ATTRIBUTES, RosterEmployeeOut


def wire_field(schema_field: str) -> str:
    """The camelCase name the frontend receives for that schema field."""
    return to_camel(schema_field)


def to_employee(row: RosterEmployeeOut) -> Employee:
    """A fresh Employee carrying every rostered attribute of `row` — used for
    inserts; the caller owns persistence."""
    employee = Employee(employee_id=row.employee_id)
    copy_row(employee, row)
    return employee


def copy_row(employee: Employee, row: RosterEmployeeOut) -> None:
    """Write every rostered attribute of `row` onto `employee` — used for
    updates, where only a full overwrite decided by the admin is correct."""
    employee.employee_id = row.employee_id
    for schema_field, column in ROSTER_ATTRIBUTES:
        setattr(employee, column, getattr(row, schema_field))


def to_row(employee: Employee) -> RosterEmployeeOut:
    # CSV columns are required strings while the table columns are nullable;
    # an unset cell round-trips as its empty-string parse.
    values = {schema_field: getattr(employee, column) or "" for schema_field, column in ROSTER_ATTRIBUTES}
    return RosterEmployeeOut(employee_id=employee.employee_id, **values)


def changed_wire_fields(existing: Employee, incoming: RosterEmployeeOut) -> list[str]:
    """Wire (camelCase) names of the fields where the stored employee differs
    from the incoming row — the preview table shows exactly those."""
    return [
        wire_field(schema_field)
        for schema_field, column in ROSTER_ATTRIBUTES
        if (getattr(existing, column) or "") != getattr(incoming, schema_field)
    ]
