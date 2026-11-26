"""Shared search / filter / sort contract for the admin roster endpoints.

Query shape and limits live here once (mirrors paging.py), so the employee
list and the review board accept the same words: `search` matches employee
name or designation case-insensitively, the dropdown fields match exactly
(blank = any), and `sortBy`/`sortOrder` pick the order from a whitelist —
unknown words fail validation before reaching a repository. The form-status
word (`all` | exactly one of the six stored lifecycle words) narrows the
Users list and the review board — and their exports, whose composed query is
the same read without the page slice. Filters, search and sort must compose:
repositories receive the built record and apply the conditions together
with the page slice.
"""

from dataclasses import dataclass
from typing import Literal

from fastapi import Query

SortOrder = Literal["asc", "desc"]

#: Sort words are the wire vocabulary (camelCase) — the client sorts "Name"
#: by `employeeName`; repositories map each word to its column.
RosterSortKey = Literal[
    "employeeName",
    "employeeId",
    "email",
    "designation",
    "location",
    "org",
    "businessUnit",
    "reportingManager",
    "employmentStatus",
]

#: `all` means no narrowing; every other word is one of the six stored
#: lifecycle words in wire case (mirrors BoardStatus in self_evaluation.py —
#: the filter names the stored word itself, no bucket nouns remain).
BoardStatusFilter = Literal[
    "all",
    "not_started",
    "self_evaluation_in_progress",
    "self_evaluation_completed",
    "in_manager_review",
    "manager_evaluation_in_progress",
    "manager_evaluation_completed",
]

BoardSortKey = Literal[
    "employeeName",
    "email",
    "org",
    "businessUnit",
    "reportingManager",
    "designation",
    "location",
    "employmentStatus",
    "employeeId",
    "status",
]


@dataclass(frozen=True)
class TableQuery:
    """The composed table read: every field is already stripped, empties mean
    "any", and `status` (`all` | one lifecycle word) narrows the Users list
    and the review board reads."""

    search: str = ""
    designation: str = ""
    location: str = ""
    org: str = ""
    business_unit: str = ""
    business_partner: str = ""
    reporting_manager: str = ""
    employment_status: str = ""
    status: BoardStatusFilter = "all"
    sort_by: BoardSortKey = "employeeName"
    sort_order: SortOrder = "asc"


def _term(value: str) -> str:
    return value.strip()


def _build_table_query(
    search: str,
    designation: str,
    location: str,
    org: str,
    business_unit: str,
    business_partner: str,
    reporting_manager: str,
    employment_status: str,
    sort_by: BoardSortKey,
    sort_order: SortOrder,
    status: BoardStatusFilter = "all",
) -> TableQuery:
    return TableQuery(
        search=_term(search),
        designation=_term(designation),
        location=_term(location),
        org=_term(org),
        business_unit=_term(business_unit),
        business_partner=_term(business_partner),
        reporting_manager=_term(reporting_manager),
        employment_status=_term(employment_status),
        status=status,
        sort_by=sort_by,
        sort_order=sort_order,
    )


def roster_query(
    search: str = Query("", max_length=120, description="Matches employee name or designation, case-insensitive."),
    designation: str = Query("", alias="designation"),
    location: str = Query("", alias="location"),
    org: str = Query("", alias="org"),
    business_unit: str = Query("", alias="businessUnit"),
    business_partner: str = Query("", alias="businessPartner"),
    reporting_manager: str = Query("", alias="reportingManager"),
    employment_status: str = Query("", alias="employmentStatus"),
    status: BoardStatusFilter = Query("all", alias="status"),
    sort_by: RosterSortKey = Query("employeeName", alias="sortBy"),
    sort_order: SortOrder = Query("asc", alias="sortOrder"),
) -> TableQuery:
    return _build_table_query(
        search, designation, location, org, business_unit, business_partner,
        reporting_manager, employment_status, sort_by, sort_order, status,
    )


def board_query(
    search: str = Query("", max_length=120, description="Matches employee name or designation, case-insensitive."),
    designation: str = Query("", alias="designation"),
    location: str = Query("", alias="location"),
    org: str = Query("", alias="org"),
    business_unit: str = Query("", alias="businessUnit"),
    business_partner: str = Query("", alias="businessPartner"),
    reporting_manager: str = Query("", alias="reportingManager"),
    employment_status: str = Query("", alias="employmentStatus"),
    status: BoardStatusFilter = Query("all", alias="status"),
    sort_by: BoardSortKey = Query("employeeName", alias="sortBy"),
    sort_order: SortOrder = Query("asc", alias="sortOrder"),
) -> TableQuery:
    return _build_table_query(
        search, designation, location, org, business_unit, business_partner,
        reporting_manager, employment_status, sort_by, sort_order, status,
    )
