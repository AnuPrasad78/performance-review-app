import { Button } from '../atoms/Button'

export interface PagerProps {
  /** The 1-based page this pager stands on; pages come from the server. */
  page: number
  pageCount: number
  onPage: (page: number) => void
}

/** Prev / page-of / Next strip for server-paginated tables; hidden while the
    collection fits on one page. */
export function Pager({ page, pageCount, onPage }: PagerProps) {
  if (pageCount <= 1) return null
  return (
    <nav className="pager" aria-label="Pages">
      <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </Button>
      <span className="pager__status mono">
        PAGE {page} OF {pageCount}
      </span>
      <Button variant="ghost" size="sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </Button>
    </nav>
  )
}
