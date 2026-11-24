import { useEffect, useState } from 'react'
import { ReviewStatusBoard } from '../components/organisms/ReviewStatusBoard'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { fetchReviewStatuses } from '../lib/api'
import type { ReviewStatusWire } from '../lib/types'

/** The board's data arrives as one backend answer: roster × evaluation state
    for the current cycle, joined and derived server-side. */
export function ReviewStatusPage() {
  const [reviews, setReviews] = useState<readonly ReviewStatusWire[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchReviewStatuses().then((result) => {
      if (cancelled) return
      if (result.ok) setReviews(result.reviews)
      else setError(result.detail)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AdminTemplate
      eyebrow="Admin · Reviews"
      title="Review form status"
      lead="Completion status of every employee's review form for this cycle. Filter the roster by pending or completed reviews."
    >
      {error !== null ? (
        <p style={{ color: 'var(--red-deep)' }}>{error}</p>
      ) : reviews === null ? (
        <p className="mono muted" style={{ fontSize: '11px' }}>
          LOADING ROSTER…
        </p>
      ) : (
        <ReviewStatusBoard entries={reviews} />
      )}
    </AdminTemplate>
  )
}
