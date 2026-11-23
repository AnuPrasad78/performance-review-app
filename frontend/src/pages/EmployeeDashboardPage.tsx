import { useEffect, useState, type ReactNode } from 'react'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { ReviewProgressCard } from '../components/organisms/ReviewProgressCard'
import { EmployeeProfileCard } from '../components/organisms/EmployeeProfileCard'
import { ReviewQuestionPanel } from '../components/organisms/ReviewQuestionPanel'
import { RatingReferencePanel } from '../components/organisms/RatingReferencePanel'
import { OverallRatingPanel } from '../components/organisms/OverallRatingPanel'
import { ForwardCommitmentsPanel } from '../components/organisms/ForwardCommitmentsPanel'
import { SignOffPanel } from '../components/organisms/SignOffPanel'
import { ReviewSectionHeading } from '../components/molecules/ReviewSectionHeading'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { useAdminStore } from '../state/AdminContext'
import { formatIsoDate, todayIsoDate } from '../lib/dates'
import { DEFAULT_SUBMISSION_DEADLINE } from '../lib/selfEvaluationContent'
import { validateSelfEvaluation } from '../lib/selfEvaluationValidation'
import {
  buildFreshDraft,
  getSelfEvaluation,
  saveSelfEvaluation,
  MOCK_EMPLOYEE,
  type SelfEvaluationRecord,
} from '../lib/selfEvaluationStore'
import type {
  AssessmentQuestionId,
  ForwardCommitment,
  RatingValue,
  ReviewSaveResult,
  SelfEvaluationDraft,
  SelfEvaluationValidation,
} from '../lib/types'

const HEAD_EYEBROW = 'Annual performance review 2026'
const RATING_VALUES: readonly RatingValue[] = [1, 2, 3, 4, 5]

const QUESTION_LABELS: Record<AssessmentQuestionId, string> = {
  contribution: 'Q1',
  strengths: 'Q2',
  development: 'Q3',
  support: 'Q4',
}

/** The greeting uses the given name; `name` from the roster CSV is the full name. */
function firstNameOf(name: string): string {
  return name.split(' ')[0] ?? name
}

export function EmployeeDashboardPage() {
  const { cycleSettings } = useAdminStore()
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

  const leadLine: ReactNode = (
    <>
      Self-evaluation due{' '}
      <strong className="page-head__due">
        {formatIsoDate(cycleSettings?.submissionDeadline ?? DEFAULT_SUBMISSION_DEADLINE)}
      </strong>
      .
    </>
  )

  if (record === null) {
    return (
      <DashboardTemplate
        eyebrow={HEAD_EYEBROW}
        title={`Hi ${firstNameOf(MOCK_EMPLOYEE.name)}`}
        lead={leadLine}
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
      eyebrow={HEAD_EYEBROW}
      title={`Hi ${firstNameOf(MOCK_EMPLOYEE.name)}`}
      lead={leadLine}
    >
      <div className="page-stack">
        <ReviewProgressCard sectionsCompleted={completedSections(draft)} sectionsTotal={7} />
        <ReviewSectionHeading number={1} title="Employee & review details" />
        <EmployeeProfileCard
          employee={draft.employee}
          readOnly={readOnly}
          onChange={(field, value) =>
            updateDraft((current) => ({ ...current, employee: { ...current.employee, [field]: value } }))
          }
        />
        <ReviewSectionHeading
          number={2}
          title="Assessment questions"
          description="Four questions, one per topic. The manager comments in the right-hand column after the discussion. Describe your own work — objectives and numbers over words."
        />
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
        <ReviewSectionHeading
          number={3}
          title="Rating scale reference"
          description="Use these definitions when giving the self-rating and before the manager completes the overall rating."
        />
        <RatingReferencePanel />
        <ReviewSectionHeading
          number={4}
          title="Overall rating & feedback"
          description="The manager's rating is based on the responses above and the role's responsibilities. The manager justifies the rating with concrete examples from across the whole year."
        />
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
        <ReviewSectionHeading
          number={5}
          title="Forward commitments for 2027"
          description="These commitments are the direct inputs to the 2027 goal-setting exercise."
        />
        <ForwardCommitmentsPanel
          commitments={draft.commitments}
          readOnly={readOnly}
          onCommitmentChange={(id, field, value) =>
            updateDraft((current) => updateCommitment(current, id, field, value))
          }
        />
        <ReviewSectionHeading
          number={6}
          title="Review discussion & sign-off"
          description="Sign-off confirms the review discussion took place and the rating and comments were shared with you."
        />
        <SignOffPanel
          employee={draft.employee}
          acknowledged={draft.acknowledged}
          signedAt={record.employeeSignedAt}
          readOnly={readOnly}
          onAcknowledgeChange={(acknowledged) => updateDraft((current) => ({ ...current, acknowledged }))}
        />
        {readOnly ? (
          <Card caption="Submitted" captionAccent>
            <p className="muted">
              Your self-evaluation was submitted on {record.submittedAt}. The form is read-only now.
            </p>
          </Card>
        ) : (
          <div className="form-actions">
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

interface DraftFields {
  questions: readonly { id: string; employeeResponse: string }[]
  overallRating: number | null
  overallSummary: string
  commitments: readonly { commitment: string; support: string }[]
}

function completedSections(draft: DraftFields | null): number {
  if (draft === null) return 0
  const answeredQuestions = draft.questions.filter((q) => q.employeeResponse.trim() !== '').length
  const overallRating = draft.overallRating !== null ? 1 : 0
  const overallSummary = draft.overallSummary.trim() !== '' ? 1 : 0
  const commitments =
    draft.commitments.every((c) => c.commitment.trim() !== '' && c.support.trim() !== '') ? 1 : 0
  return answeredQuestions + overallRating + overallSummary + commitments
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
