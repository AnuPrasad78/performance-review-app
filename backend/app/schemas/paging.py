"""Shared pagination contract for the admin list endpoints.

Query shape (`page`, `pageSize`) and defaults live here once, so every list
endpoint accepts the same words and the client copies the constants without
a translation table. Row-shaping stays with each endpoint's service.
"""

from dataclasses import dataclass

from fastapi import Query

DEFAULT_PAGE_SIZE = 10
MAX_PAGE_SIZE = 100


@dataclass(frozen=True)
class Paging:
    page: int
    page_size: int


def paging(
    page: int = Query(1, ge=1, alias="page", description="1-based page number."),
    page_size: int = Query(
        DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, alias="pageSize",
        description="Rows per page.",
    ),
) -> Paging:
    return Paging(page=page, page_size=page_size)
