import { useEffect, useState } from 'react'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { fetchReviewBoard } from '../lib/api'
import type { CompletionFilter } from '../lib/reviewStatusStore'
import type { ReviewBoardPage } from '../lib/types'

/** The board's data arrives as one backend answer per (status filter, page):
    the page slice plus the whole-roster distribution for the tiles and pie —
    the roster never loads whole on the client. */
export function ReviewStatusPage() {
  const [filter, setFilter] = useState<CompletionFilter>('pending')
  const [page, setPage] = useState(1)
  const [board, setBoard] = useState<ReviewBoardPage | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchReviewBoard({ page, status: filter }).then((result) => {
      if (cancelled) return
      if (result.ok) {
        setBoard(result.board)
        setError(null)
      } else {
        setError(result.detail)
      }
    })
    return () => {
      cancelled = true
    }
  }, [filter, page])

  const pageCount =
    board === null ? 1 : Math.max(1, Math.ceil(board.total / board.pageSize))

  // The filter's row set shrank under this page: land on the last page the
  // server still holds instead of showing an empty grid.
  useEffect(() => {
    if (pageCount > 0 && page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function chooseFilter(next: CompletionFilter): void {
    setFilter(next)
    setPage(1)
  }

  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Review form status"
      lead="Completion status of every employee's review form for this cycle. Filter the roster by pending or completed reviews."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : board === null ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <ReviewStatusBoard
          entries={board.reviews}
          statusCounts={board.statusCounts}
          total={board.total}
          page={page}
          pageCount={pageCount}
          filter={filter}
          onFilterChange={chooseFilter}
          onPageChange={setPage}
        />
      )}
    </AdminTemplate>
  )
}
