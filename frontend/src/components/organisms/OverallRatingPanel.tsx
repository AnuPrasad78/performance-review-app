import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { ReviewScoreSelector } from '../molecules/ReviewScoreSelector'
import { Textarea } from '../atoms/Textarea'
import type { RatingValue } from '../../lib/types'

export interface OverallRatingPanelProps {
  ratingValues: readonly RatingValue[]
  overallRating: RatingValue | null
  overallSummary: string
  readOnly: boolean
  ratingError?: string | null
  summaryError?: string | null
  onRatingSelect: (rating: RatingValue | null) => void
  onSummaryChange: (summary: string) => void
}

/** Per-rating guidance revealed on hover or keyboard focus, one chip at a time. */
const RATING_TOOLTIPS: Record<RatingValue, string> = {
  5: 'Significantly exceeds expectations: Significantly exceeded targets; contributed to process improvement.',
  4: 'Exceeds expectations: Delivered and exceeded targets and results.',
  3: 'Meets expectations: Meets expected targets; achieved intended results.',
  2: 'Below expectations: The employee needs improvement.',
  1: 'Significantly below expectations: The employee significantly needs improvement.',
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
          error={ratingError ?? null}
        >
          {readOnly ? (
            <span className="rating-panel__value mono">{overallRating ?? '—'}</span>
          ) : (
            <ReviewScoreSelector
              values={ratingValues}
              value={overallRating}
              disabled={false}
              onChange={(value) => onRatingSelect(value === null ? null : (value as RatingValue))}
              ariaLabel="Overall self-rating from 1 to 5"
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
            onChange={(event) => onSummaryChange(event.target.value)}
          />
        </FormField>
      </div>
    </Card>
  )
}
