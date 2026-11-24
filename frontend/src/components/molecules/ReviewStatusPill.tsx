import { reviewStatusTone, REVIEW_STATUS_LABELS } from '../../lib/selfEvaluationStore'
import type { ReviewStatus } from '../../lib/types'

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  return <span className={`pill pill--${reviewStatusTone(status)}`}>{REVIEW_STATUS_LABELS[status]}</span>
}
