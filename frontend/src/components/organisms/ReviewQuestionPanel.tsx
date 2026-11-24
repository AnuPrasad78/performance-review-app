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

/** Shown in the manager column while the manager's state is still null. */
const NO_MANAGER_COMMENT = 'Manager comments are shared after the review discussion.'

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
        <div className="question-panel__columns">
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
          <div className="field">
            <span className="field__label" id={`manager-comment-${question.id}`}>
              Manager comments
            </span>
            {question.managerComment === null ? (
              <p className="question-panel__empty muted" aria-describedby={`manager-comment-${question.id}`}>
                {NO_MANAGER_COMMENT}
              </p>
            ) : (
              <Textarea
                aria-labelledby={`manager-comment-${question.id}`}
                value={question.managerComment}
                readOnly
                disabled
              />
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
