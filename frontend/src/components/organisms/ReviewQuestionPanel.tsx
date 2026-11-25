import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { Textarea } from '../atoms/Textarea'
import type { AssessmentQuestion } from '../../lib/types'

export interface ReviewQuestionPanelProps {
  question: AssessmentQuestion
  /** Human identifier for the question number, e.g. "Q1". */
  label: string
  readOnly: boolean
  error?: string | null
  /** Absent on display-only renders (backend-served answer states). */
  onResponseChange?: (questionId: AssessmentQuestion['id'], value: string) => void
}

/** The manager's column is deliberately absent here: manager comments exist
    on the record but are disclosed to the employee only after the manager
    review window closes (or HR releases them) — when that gate ships, the
    two-column layout comes back alongside it. */
export function ReviewQuestionPanel({
  question,
  label,
  readOnly,
  error,
  onResponseChange,
}: ReviewQuestionPanelProps) {
  return (
    <Card>
      <div className="question-panel">
        <h3 className="question-panel__title">
          {label}. {question.question}
        </h3>
        <FormField
          id={`response-${question.id}`}
          label="Employee response"
          required
          error={error ?? null}
        >
          {readOnly ? (
            <Textarea
              id={`response-${question.id}`}
              value={question.employeeResponse}
              disabled
              readOnly
              aria-label={`${label} — employee response`}
            />
          ) : (
            <Textarea
              id={`response-${question.id}`}
              value={question.employeeResponse}
              onChange={(event) => onResponseChange?.(question.id, event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Card>
  )
}
