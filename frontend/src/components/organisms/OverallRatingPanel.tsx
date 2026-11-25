import { useEffect, useRef, useState } from 'react'
import { Card } from '../atoms/Card'
import { Icon } from '../atoms/Icon'
import { FormField } from '../molecules/FormField'
import { ReviewScoreSelector } from '../molecules/ReviewScoreSelector'
import { Textarea } from '../atoms/Textarea'
import { RATING_SCALE_REFERENCE } from '../../lib/selfEvaluationContent'
import type { RatingValue } from '../../lib/types'

export interface OverallRatingPanelProps {
  ratingValues: readonly RatingValue[]
  overallRating: RatingValue | null
  overallSummary: string
  readOnly: boolean
  ratingError?: string | null
  summaryError?: string | null
  /** Absent on display-only renders; null deselects the active chip. */
  onRatingSelect?: (rating: RatingValue | null) => void
  onSummaryChange?: (summary: string) => void
}

/** Per-rating guidance revealed on hover or keyboard focus, one chip at a time. */
const RATING_TOOLTIPS: Record<RatingValue, string> = {
  5: 'Significantly exceeds expectations: Significantly exceeded targets; contributed to process improvement.',
  4: 'Exceeds expectations: Delivered and exceeded targets and results.',
  3: 'Meets expectations: Meets expected targets; achieved intended results.',
  2: 'Below expectations: The employee needs improvement.',
  1: 'Significantly below expectations: The employee significantly needs improvement.',
}

/** The published scale, revealed on hover or keyboard focus beside the
    "Overall self-rating" label — the table card it replaced took a whole
    page section for the same five lines. */
function RatingScaleInfo() {
  const [open, setOpen] = useState(false)
  const [offsetLeft, setOffsetLeft] = useState(0)
  const anchorRef = useRef<HTMLButtonElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)

  // Measured after each open so a popover near the window's right edge
  // flips inside instead of clipping (the offset is relative to the anchor).
  const measureOnOpen = (): void => {
    const anchor = anchorRef.current
    const popover = popoverRef.current
    if (anchor === null || popover === null) return
    const left = anchor.getBoundingClientRect().left
    const maxLeft = window.innerWidth - 16 - popover.offsetWidth
    const clampedLeft = Math.min(Math.max(left, 8), Math.max(maxLeft, 8))
    setOffsetLeft(Math.round(clampedLeft - left))
  }

  useEffect(() => {
    if (open) measureOnOpen()
  }, [open])

  return (
    <span
      className="rating-info"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={anchorRef}
        type="button"
        className="rating-info__trigger"
        aria-label="Rating scale reference"
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Icon name="info" size={14} />
      </button>
      {open ? (
        <div
          ref={popoverRef}
          role="group"
          aria-label="Rating scale (5 to 1)"
          className="rating-info__popover"
          style={{ left: offsetLeft }}
        >
          <p className="rating-info__title mono">Rating scale</p>
          {[...RATING_SCALE_REFERENCE]
            .sort((a, b) => b.value - a.value)
            .map((entry) => (
              <div key={entry.value} className="rating-info__row">
                <span className="mono rating-info__value">{entry.value}</span>
                <span>
                  <strong className="rating-info__name">{entry.name}</strong>
                  {' — '}
                  {entry.description}
                </span>
              </div>
            ))}
          <p className="rating-info__note muted">
            The self-rating is a discussion input, not a verdict. The manager chooses the
            overall rating after reading the responses and the review conversation.
          </p>
        </div>
      ) : null}
    </span>
  )
}

export function OverallRatingPanel({
  ratingValues,
  overallRating,
  overallSummary,
  readOnly,
  ratingError,
  summaryError,
  onRatingSelect,
  onSummaryChange,
}: OverallRatingPanelProps) {
  const tooltips = ratingValues.map((value) => RATING_TOOLTIPS[value])
  return (
    <Card>
      <div className="rating-panel">
        <FormField
          id="overall-self-rating"
          label="Overall self-rating"
          required
          hint={<RatingScaleInfo />}
          error={ratingError ?? null}
        >
          {readOnly ? (
            <span className="rating-panel__value mono">{overallRating ?? '—'}</span>
          ) : (
            <ReviewScoreSelector
              values={ratingValues}
              value={overallRating}
              disabled={false}
              onChange={(value) => onRatingSelect?.(value === null ? null : (value as RatingValue))}
              ariaLabel="Overall self-rating from 5 to 1"
              tooltips={tooltips}
            />
          )}
        </FormField>
        <FormField
          id="overall-summary"
          label="Overall comments"
          required
          error={summaryError ?? null}
        >
          <Textarea
            id="overall-summary"
            value={overallSummary}
            disabled={readOnly}
            onChange={(event) => onSummaryChange?.(event.target.value)}
          />
        </FormField>
      </div>
    </Card>
  )
}
