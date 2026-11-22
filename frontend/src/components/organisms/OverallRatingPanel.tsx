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
  onRatingSelect: (rating: RatingValue) => void
  onSummaryChange: (summary: string) => void
}

const NO_MANAGER_RATING = 'Not decided yet. Your manager sets this after the discussion.'

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
              onChange={(value) => onRatingSelect(value as RatingValue)}
              ariaLabel="Overall self-rating from 1 to 5"
            />
          )}
        </FormField>
        <p className="rating-panel__reference muted">
          Choose your overall self-rating using the rating definitions in section 3. The
          self-rating is a discussion input, not a verdict.
        </p>
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
        <div className="field">
          <span className="field__label" id="manager-rating-label">
            Manager rating
          </span>
          <p className="rating-panel__empty muted" aria-describedby="manager-rating-label">
            {NO_MANAGER_RATING}
          </p>
        </div>
      </div>
    </Card>
  )
}
