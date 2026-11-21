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

const RATING_REFERENCE: readonly { value: number; meaning: string }[] = [
  { value: 5, meaning: 'Significantly exceeds — contributed to process improvement' },
  { value: 4, meaning: 'Exceeds' },
  { value: 3, meaning: 'Meets' },
  { value: 2, meaning: 'Below' },
  { value: 1, meaning: 'Significantly below' },
]

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
    <Card caption="Overall rating & feedback" captionAccent>
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
          {RATING_REFERENCE.map((entry) => `${entry.value} — ${entry.meaning}`).join('. ')}.
          The self-rating is a discussion input, not a verdict.
        </p>
        <FormField
          id="overall-summary"
          label="Your overall summary comment"
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
