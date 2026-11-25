"""Roster import contracts.

Field names mirror the roster CSV header, so a report row can be matched
against the source file without a translation table. Over the wire the keys
are camelCase to match the TypeScript client; internal code uses snake_case.

The import is diff-then-decide: /import reports which uploads are new and
which collide with stored employees, and /import/apply writes only after the
admin confirms (new rows as inserts, collided rows where the admin chose
Update).
"""

from app.schemas.base import ApiModel


class RosterEmployeeOut(ApiModel):
    employee_id: str
    name: str
    email: str
    designation: str
    location: str
    org: str
    project: str
    delivery_head: str
    delivery_manager: str
    business_partner: str
    reporting_manager: str
    status: str


class RosterRowError(ApiModel):
    line: int
    message: str


class RosterRowErrors(ApiModel):
    errors: list[RosterRowError]


class RosterConflict(ApiModel):
    """One upload row whose email identity is already stored (case-insensitive
    match) — the admin must decide per row whether the stored employee is
    overwritten or kept."""

    email: str
    existing: RosterEmployeeOut
    incoming: RosterEmployeeOut
    changed_fields: list[str]


class RosterImportReport(ApiModel):
    imported_count: int
    duplicates_skipped: int
    conflicts: list[RosterConflict]
    #: Every validated row of the file. The client echoes the new ones back in
    #: RosterApplyPayload (those it decided to keep are left out) — the apply
    #: step writes only what this report produced, verbatim.
    employees: list[RosterEmployeeOut]


class RosterApplyPayload(ApiModel):
    inserts: list[RosterEmployeeOut]
    updates: list[RosterEmployeeOut]


class RosterApplyReport(ApiModel):
    imported_count: int
    updated_count: int


class RosterConflictEmails(ApiModel):
    emails: list[str]


class EmployeeList(ApiModel):
    employees: list[RosterEmployeeOut]
    total: int
    page: int
    page_size: int


class RosterFacets(ApiModel):
    """Distinct whole-roster dropdown values per filterable roster column —
    the admin tables' filter option lists, independent of any current filter."""

    designations: list[str]
    locations: list[str]
    orgs: list[str]
    reporting_managers: list[str]
    employment_statuses: list[str]


#: (RosterEmployeeOut field, employees column) pairs, including the identities.
#: employee_id — the primary key — is deliberately excluded from the copy-over
#: loop: it identifies a row, never a copied value. roster_mapping diffs it
#: separately (changed_wire_fields) so an ID move still previews as a change;
#: roster_apply carries it as the updated row's (possibly new) PK. Plain
#: strings, so this contract table stays importable from every layer without
#: reaching into models.
ROSTER_ATTRIBUTES: tuple[tuple[str, str], ...] = (
    ("name", "employee_name"),
    ("email", "email"),
    ("designation", "designation"),
    ("location", "location"),
    ("org", "org"),
    ("project", "current_account_project"),
    ("delivery_head", "delivery_head"),
    ("delivery_manager", "delivery_manager"),
    ("business_partner", "business_partner"),
    ("reporting_manager", "reporting_manager"),
    ("status", "employment_status"),
)
