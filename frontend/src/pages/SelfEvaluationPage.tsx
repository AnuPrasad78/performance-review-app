import { useEffect, useState, type ReactNode } from 'react'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { ReviewQuestionPanel } from '../components/organisms/ReviewQuestionPanel'
import { OverallRatingPanel } from '../components/organisms/OverallRatingPanel'
import { ForwardCommitmentsPanel } from '../components/organisms/ForwardCommitmentsPanel'
import { SignOffPanel } from '../components/organisms/SignOffPanel'
import { validateSelfEvaluation } from '../lib/selfEvaluationValidation'
import {
  buildFreshDraft,
  getSelfEvaluation,
  saveSelfEvaluation,
  type SelfEvaluationRecord,
} from '../lib/selfEvaluationStore'
import { todayIsoDate } from '../lib/dates'
import type {
  AssessmentQuestionId,
  ForwardCommitment,
  RatingValue,
  ReviewSaveResult,
  SelfEvaluationDraft,
  SelfEvaluationValidation,
} from '../lib/types'

const QUESTION_LABELS: Record<AssessmentQuestionId, string> = {
  contribution: 'Q1',
  strengths: 'Q2',
  development: 'Q3',
  support: 'Q4',
}

const RATING_VALUES: readonly RatingValue[] = [1, 2, 3, 4, 5]

export function SelfEvaluationPage() {
  const [record, setRecord] = useState<SelfEvaluationRecord | null>(null)
  const [validation, setValidation] = useState<SelfEvaluationValidation | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<ReviewSaveResult | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSelfEvaluation().then((loaded) => {
      if (!cancelled) setRecord(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (record === null) {
    return (
      <DashboardTemplate
        eyebrow="Annual performance review 2026"
        title="Self-evaluation"
        lead="Complete the 2026 assessment, the overall rating, and your commitments for 2027."
      >
        <p className="muted">Loading your review.</p>
      </DashboardTemplate>
    )
  }

  const readOnly = record.submittedAt !== null
  const draft = record.draft ?? buildFreshDraft()
  const errorFor = (questionId: AssessmentQuestionId): string | null =>
    validation?.fieldErrors.questionErrors[questionId] ?? null

  const updateDraft = (mutate: (draft: SelfEvaluationDraft) => SelfEvaluationDraft): void => {
    setRecord((current) => {
      if (current === null) return current
      const nextDraft = current.draft ?? buildFreshDraft()
      return { ...current, draft: mutate(nextDraft) }
    })
  }

  const persist = (next: SelfEvaluationRecord): void => {
    setSaving(true)
    void saveSelfEvaluation(next).then((savedResult) => {
      setNotice(savedResult)
      if (savedResult.ok) setRecord(next)
      setSaving(false)
    })
  }

  const handleSaveDraft = (): void => {
    setValidation(null)
    persist(stampSignature({ ...record, draft }))
  }

  const handleSubmit = (): void => {
    const outcome = validateSelfEvaluation(draft)
    setValidation(outcome)
    if (!outcome.isValid) {
      setNotice({ ok: false, error: 'Complete the flagged fields before submitting.' })
      return
    }
    persist(stampSignature({ ...record, draft, submittedAt: todayIsoDate() }))
  }

  return (
    <DashboardTemplate
      eyebrow="Annual performance review 2026"
      title="Self-evaluation"
      lead="Complete the 2026 assessment, the overall rating, and your commitments for 2027."
    >
      <div className="page-stack">
        {draft.questions.map((question) => (
          <ReviewQuestionPanel
            key={question.id}
            question={question}
            label={QUESTION_LABELS[question.id]}
            readOnly={readOnly}
            error={errorFor(question.id)}
            onResponseChange={(questionId, value) =>
              updateDraft((current) => updateQuestion(current, questionId, value))
            }
          />
        ))}
        <OverallRatingPanel
          ratingValues={RATING_VALUES}
          overallRating={draft.overallRating}
          overallSummary={draft.overallSummary}
          readOnly={readOnly}
          ratingError={validation?.fieldErrors.overallRating ?? null}
          summaryError={validation?.fieldErrors.overallSummary ?? null}
          onRatingSelect={(rating) => updateDraft((current) => ({ ...current, overallRating: rating }))}
          onSummaryChange={(summary) => updateDraft((current) => ({ ...current, overallSummary: summary }))}
        />
        <ForwardCommitmentsPanel
          commitments={draft.commitments}
          readOnly={readOnly}
          onCommitmentChange={(id, field, value) =>
            updateDraft((current) => updateCommitment(current, id, field, value))
          }
        />
        <SignOffPanel
          employee={draft.employee}
          signedAt={record.employeeSignedAt}
          readOnly={readOnly}
          onConfirm={() => updateDraft((current) => ({ ...current, acknowledged: true }))}
        />
        {readOnly ? (
          <Card caption="Submitted" captionAccent>
            <p className="muted">
              Your self-evaluation was submitted on {record.submittedAt}. The form is read-only now.
            </p>
          </Card>
        ) : (
          <div className="form-actions self-eval-actions">
            <Button variant="ghost" busy={saving} onClick={handleSaveDraft}>
              Save draft
            </Button>
            <Button busy={saving} onClick={handleSubmit}>
              Submit
            </Button>
          </div>
        )}
        <SaveNotice notice={notice} />
      </div>
    </DashboardTemplate>
  )
}

function SaveNotice({ notice }: { notice: ReviewSaveResult | null }): ReactNode {
  if (notice === null) return null
  if (notice.ok) {
    return <p className="muted" role="status">Draft saved.</p>
  }
  return (
    <p className="field__error" role="alert">
      {notice.error}
    </p>
  )
}

/** A confirmed sign-off is stamped by the app at save time — never hand-edited. */
function stampSignature(record: SelfEvaluationRecord): SelfEvaluationRecord {
  if (record.draft?.acknowledged === true && record.employeeSignedAt === null) {
    return { ...record, employeeSignedAt: todayIsoDate() }
  }
  return record
}

function updateQuestion(
  draft: SelfEvaluationDraft,
  id: AssessmentQuestionId,
  response: string,
): SelfEvaluationDraft {
  return {
    ...draft,
    questions: draft.questions.map((question) =>
      question.id === id ? { ...question, employeeResponse: response } : question,
    ),
  }
}

function updateCommitment(
  draft: SelfEvaluationDraft,
  id: number,
  field: keyof ForwardCommitment,
  value: string,
): SelfEvaluationDraft {
  return {
    ...draft,
    commitments: draft.commitments.map((commitment) =>
      commitment.id === id ? { ...commitment, [field]: value } : commitment,
    ),
  }
}
