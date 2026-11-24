import { useEffect, useRef, useState, type ReactNode } from 'react'
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
import { useAuth } from '../state/AuthContext'
import { formatIsoDate } from '../lib/dates'
import { DEFAULT_SUBMISSION_DEADLINE } from '../lib/selfEvaluationContent'
import { saveSelfEvaluation, submitSelfEvaluation, fetchSelfEvaluation } from '../lib/api'
import {
  commitmentsPayloadFromDraft,
  mergeRecordFromApi,
  payloadFromDraft,
  recordFromApi,
  type SelfEvaluationRecord,
} from '../lib/selfEvaluationStore'
import { validateSelfEvaluation } from '../lib/selfEvaluationValidation'
import { useAutoSave } from '../hooks/useAutoSave'
import type {
  AssessmentQuestionId,
  ForwardCommitment,
  RatingValue,
  SelfEvaluationDraft,
  SelfEvaluationValidation,
} from '../lib/types'

const HEAD_EYEBROW = 'Annual performance review 2026'
const RATING_VALUES: readonly RatingValue[] = [1, 2, 3, 4, 5]
const AUTO_SAVE_DELAY_MS = 1200

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
  const { session } = useAuth()
  const [record, setRecord] = useState<SelfEvaluationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [validation, setValidation] = useState<SelfEvaluationValidation | null>(null)

  // The hook reads the payload through this ref, so its closures stay stable
  // while page state moves; the mirror is one effect behind the state.
  const recordRef = useRef<SelfEvaluationRecord | null>(null)
  useEffect(() => {
    recordRef.current = record
  }, [record])

  const autoSave = useAutoSave({
    delayMs: AUTO_SAVE_DELAY_MS,
    currentPayload: () => {
      const current = recordRef.current
      if (current === null) return {}
      // Post-submit saves may only carry commitments — the server rejects
      // every other member with the freeze envelope.
      return current.submittedAt === null
        ? payloadFromDraft(current.draft)
        : commitmentsPayloadFromDraft(current.draft)
    },
    perform: saveSelfEvaluation,
    onSaved: (result) => {
      const wasOpen = recordRef.current?.submittedAt === null
      setRecord((current) =>
        current === null ? current : mergeRecordFromApi(current, result.data),
      )
      setNotice(wasOpen ? 'Draft saved.' : 'Commitments saved.')
    },
    onError: (detail) => setNotice(detail),
  })

  useEffect(() => {
    let cancelled = false
    void fetchSelfEvaluation().then((result) => {
      if (cancelled) return
      if (result.ok) setRecord(recordFromApi(result.data))
      else setLoadError(result.detail)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const firstName = firstNameOf(session?.name ?? '')
  const leadLine: ReactNode = (
    <>
      Self-evaluation due{' '}
      <strong className="page-head__due">
        {formatIsoDate(record?.submissionDeadline ?? DEFAULT_SUBMISSION_DEADLINE)}
      </strong>
      .
    </>
  )

  if (loadError !== null) {
    return (
      <DashboardTemplate
        eyebrow={HEAD_EYEBROW}
        title={`Hi ${firstName || 'there'}`}
        lead={leadLine}
      >
        <Card caption="Review unavailable">
          <p className="muted">{loadError}</p>
        </Card>
      </DashboardTemplate>
    )
  }

  if (record === null) {
    return (
      <DashboardTemplate
        eyebrow={HEAD_EYEBROW}
        title={`Hi ${firstName || 'there'}`}
        lead={leadLine}
      >
        <p className="muted" role="status">
          Loading your review.
        </p>
      </DashboardTemplate>
    )
  }

  const draft = record.draft
  const answersEditable = record.submittedAt === null
  const busy = autoSave.saving || submitting
  const errorFor = (questionId: AssessmentQuestionId): string | null =>
    validation?.fieldErrors.questionErrors[questionId] ?? null

  /** Edits land in local state; the hook decides when they go to the API. */
  const updateDraft = (mutate: (draft: SelfEvaluationDraft) => SelfEvaluationDraft): void => {
    setRecord((current) =>
      current === null ? current : { ...current, draft: mutate(current.draft) },
    )
    autoSave.requestSave()
  }

  /** Save immediately, then submit — an un-flushed draft would submit
      incomplete even though the form looks complete locally. */
  const handleSubmit = (): void => {
    const outcome = validateSelfEvaluation(draft)
    setValidation(outcome)
    if (!outcome.isValid) {
      setNotice('Complete the flagged fields before submitting.')
      return
    }
    setSubmitting(true)
    void autoSave
      .flush()
      .then(() => submitSelfEvaluation())
      .then((result) => {
        if (result.ok) {
          setRecord(mergeRecordFromApi(recordRef.current ?? record, result.data))
          setNotice('Submitted.')
        } else {
          setNotice(result.detail)
        }
      })
      .finally(() => setSubmitting(false))
  }

  return (
    <DashboardTemplate eyebrow={HEAD_EYEBROW} title={`Hi ${firstName}`} lead={leadLine}>
      <div className="page-stack">
        <ReviewProgressCard sectionsCompleted={completedSections(draft)} sectionsTotal={7} />
        <ReviewSectionHeading number={1} title="Employee & review details" />
        <EmployeeProfileCard employee={draft.employee} readOnly />
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
            readOnly={!answersEditable}
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
          readOnly={!answersEditable}
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
          readOnly={!record.commitmentsEditable}
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
          readOnly
        />
        {answersEditable ? (
          <div className="form-actions">
            <Button variant="ghost" busy={busy} onClick={() => void autoSave.flush()}>
              Save draft
            </Button>
            <Button busy={busy} onClick={handleSubmit}>
              Submit
            </Button>
          </div>
        ) : record.commitmentsEditable ? (
          <Card caption="Submitted — commitments stay open" captionAccent>
            <p className="muted">
              Your self-evaluation is read-only now. The forward commitments below stay
              editable until the manager review window closes.
            </p>
            <div className="form-actions">
              <Button busy={busy} onClick={() => void autoSave.flush()}>
                Save commitments
              </Button>
            </div>
          </Card>
        ) : (
          <Card caption="Submitted" captionAccent>
            <p className="muted">Your self-evaluation was submitted. The form is read-only now.</p>
          </Card>
        )}
        <SaveNotice notice={notice} />
      </div>
    </DashboardTemplate>
  )
}

function SaveNotice({ notice }: { notice: string | null }): ReactNode {
  if (notice === null) return null
  return (
    <p className="muted" role="status">
      {notice}
    </p>
  )
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
