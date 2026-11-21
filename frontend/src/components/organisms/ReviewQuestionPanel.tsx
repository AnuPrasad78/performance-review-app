import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { Textarea } from '../atoms/Textarea'
import type { AssessmentQuestion } from '../../lib/types'

export interface ReviewQuestionPanelProps {
  question: AssessmentQuestion
  /** Human identifier for form labels, e.g. "Q1". */
  label: string
  readOnly: boolean
  error?: string | null
  onResponseChange: (questionId: AssessmentQuestion['id'], value: string) => void
}

const NO_MANAGER_COMMENT = 'No manager comment yet. Your manager will comment after submission.'

export function ReviewQuestionPanel({
  question,
  label,
  readOnly,
  error,
  onResponseChange,
}: ReviewQuestionPanelProps) {
  return (
    <Card caption={`${label} · Assessment question`} captionAccent>
      <div className="question-panel">
        <p className="question-panel__text">{question.question}</p>
        <div className="question-panel__columns">
          <FormField
            id={`response-${question.id}`}
            label="Your response"
            required
            error={error ?? null}
          >
            {readOnly ? (
              <Textarea
                id={`response-${question.id}`}
                value={question.employeeResponse}
                disabled
                readOnly
                aria-label={`${label} — your response`}
              />
            ) : (
              <Textarea
                id={`response-${question.id}`}
                value={question.employeeResponse}
                onChange={(event) => onResponseChange(question.id, event.target.value)}
              />
            )}
          </FormField>
          <div className="field">
            <span className="field__label" id={`manager-comment-${question.id}`}>
              Manager comment
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
