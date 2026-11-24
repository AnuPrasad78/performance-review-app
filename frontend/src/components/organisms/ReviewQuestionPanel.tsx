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
  onResponseChange: (questionId: AssessmentQuestion['id'], value: string) => void
}

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
              onChange={(event) => onResponseChange(question.id, event.target.value)}
            />
          )}
        </FormField>
      </div>
    </Card>
  )
}
