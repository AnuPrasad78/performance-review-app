import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HeroHeader, type HeroSectionProgress } from '../components/organisms/HeroHeader'
import { EmployeeProfileCard } from '../components/organisms/EmployeeProfileCard'
import { RatingReferencePanel } from '../components/organisms/RatingReferencePanel'
import { ReviewQuestionPanel } from '../components/organisms/ReviewQuestionPanel'
import { OverallRatingPanel } from '../components/organisms/OverallRatingPanel'
import { ForwardCommitmentsPanel } from '../components/organisms/ForwardCommitmentsPanel'
import { SignOffPanel } from '../components/organisms/SignOffPanel'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { saveSelfEvaluation, submitSelfEvaluation, fetchSelfEvaluation } from '../lib/api'
import {
  commitmentsPayloadFromDraft,
  loadResumeIndices,
  mergeRecordFromApi,
  payloadFromDraft,
  recordFromApi,
  saveResumeIndices,
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

const RATING_VALUES: readonly RatingValue[] = [1, 2, 3, 4, 5]
const AUTO_SAVE_DELAY_MS = 1200

const QUESTION_LABELS: Record<AssessmentQuestionId, string> = {
  contribution: 'Q1',
  strengths: 'Q2',
  development: 'Q3',
  support: 'Q4',
}

/** The four numbered review sections of the wizard. */
interface WizardStep {
  key: 'questions' | 'overall' | 'commitments' | 'signoff'
  title: string
  description: string
}

const STEPS: readonly WizardStep[] = [
  {
    key: 'questions',
    title: 'Assessment Questions',
    description:
      'Four questions, one per topic. Use Next to move between them. Describe your own work — objectives and numbers over words.',
  },
  {
    key: 'overall',
    title: 'Overall Rating & Feedback',
    description:
      'The manager’s rating is based on the responses above and the role’s responsibilities. Justify the rating with concrete examples from across the whole year.',
  },
  {
    key: 'commitments',
    title: 'Forward Commitments for 2027',
    description: 'These commitments are the direct inputs to the 2027 goal-setting exercise.',
  },
  {
    key: 'signoff',
    title: 'Review Discussion & Sign-off',
    description:
      'Sign-off confirms the review discussion took place and the rating and comments were shared with you.',
  },
]

export function EmployeeDashboardPage() {
  const [record, setRecord] = useState<SelfEvaluationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [validation, setValidation] = useState<SelfEvaluationValidation | null>(null)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const lastResumeRef = useRef('')

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
      if (result.ok) {
        const initial = recordFromApi(result.data)
        const resume = loadResumeIndices()
        const resumedSection =
          resume.lastStepIndex === null
            ? 0
            : Math.min(Math.max(resume.lastStepIndex, 0), STEPS.length - 1)
        const resumedQuestion =
          resume.lastQuestionIndex === null
            ? 0
            : Math.min(Math.max(resume.lastQuestionIndex, 0), 3)
        setSectionIndex(resumedSection)
        setQuestionIndex(resumedQuestion)
        setRecord(initial)
      } else {
        setLoadError(result.detail)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** The wizard's position is a pure view concern: it persists to local
      storage only, never into the record the server keeps. */
  useEffect(() => {
    if (record === null) return
    const indices = { lastStepIndex: sectionIndex, lastQuestionIndex: questionIndex }
    const json = JSON.stringify(indices)
    if (json === lastResumeRef.current) return
    lastResumeRef.current = json
    saveResumeIndices(indices)
  }, [record, sectionIndex, questionIndex])

  if (loadError !== null) {
    return (
      <div className="hero-page">
        <div className="hero-card brand-frame">
          <HeroHeader sectionProgress={[]} />
          <div className="hero-card__body">
            <p className="muted">{loadError}</p>
          </div>
        </div>
      </div>
    )
  }

  if (record === null) {
    return (
      <div className="hero-page">
        <div className="hero-card brand-frame">
          <HeroHeader sectionProgress={[]} />
          <div className="hero-card__body">
            <p className="muted" role="status">
              Loading your review.
            </p>
          </div>
        </div>
      </div>
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

  const step = STEPS[Math.min(Math.max(sectionIndex, 0), STEPS.length - 1)]
  if (step === undefined) return null
  const isQuestionsSection = sectionIndex === 0
  const isLastSection = step.key === 'signoff'
  const stepQuestion = draft.questions[questionIndex]
  const questionLabel = `Question ${questionIndex + 1} of ${draft.questions.length}`

  const goToPrevious = (): void => {
    if (!isQuestionsSection) {
      if (sectionIndex === 1) setQuestionIndex(Math.max(0, draft.questions.length - 1))
      setSectionIndex((index) => Math.max(0, index - 1))
      return
    }
    if (questionIndex > 0) setQuestionIndex((index) => index - 1)
  }

  const goToNext = (): void => {
    if (isQuestionsSection) {
      if (questionIndex < draft.questions.length - 1) {
        setQuestionIndex((index) => index + 1)
      } else {
        setSectionIndex(1)
      }
      return
    }
    setSectionIndex((index) => Math.min(STEPS.length - 1, index + 1))
  }

  const goToSection = (index: number): void => {
    setSectionIndex(Math.min(Math.max(index, 0), STEPS.length - 1))
  }

  const showPrevious = !(isQuestionsSection && questionIndex === 0)
  const showNext = !isLastSection
  const showSubmit = isLastSection && answersEditable

  /** Save immediately, then submit — an un-flushed draft would submit
      incomplete even though the form looks complete locally. */
  const submit = (): void => {
    const outcome = validateSelfEvaluation(draft)
    setValidation(outcome)
    if (!outcome.isValid) {
      const firstInvalidQuestion = draft.questions.findIndex(
        (question) => outcome.fieldErrors.questionErrors[question.id] !== undefined,
      )
      if (firstInvalidQuestion >= 0) {
        setSectionIndex(0)
        setQuestionIndex(firstInvalidQuestion)
      } else if (
        outcome.fieldErrors.overallRating !== null ||
        outcome.fieldErrors.overallSummary !== null
      ) {
        setSectionIndex(1)
      } else if (outcome.fieldErrors.commitments !== null) {
        setSectionIndex(2)
      }
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

  /** A section counts as done only when every field in it is filled. */
  const questionsDone = draft.questions.every((q) => q.employeeResponse.trim() !== '')
  const overallDone = draft.overallRating !== null && draft.overallSummary.trim() !== ''
  const commitmentDone =
    draft.commitments[0]?.commitment.trim() !== '' && draft.commitments[0]?.support.trim() !== ''
  const signed = record.employeeSignedAt !== null
  const sectionsDone =
    (questionsDone ? 1 : 0) + (overallDone ? 1 : 0) + (commitmentDone ? 1 : 0) + (signed ? 1 : 0)
  const sectionProgress: readonly HeroSectionProgress[] = [
    { label: 'Sections', value: `${sectionsDone}/4` },
    { label: 'Sign-off', value: signed ? 'Completed' : 'Pending' },
  ]
  return (
    <div className="hero-page">
      <div className="hero-card brand-frame">
        <HeroHeader sectionProgress={sectionProgress} />
        <div className="hero-card__body">
          <div className="page-stack">
            <EmployeeProfileCard employee={draft.employee} readOnly />
            <nav className="steps-nav" aria-label="Review sections">
              {STEPS.map((stepEntry, index) => {
                const classes = ['steps-nav__step', index === sectionIndex ? 'is-active' : '']
                  .filter(Boolean)
                  .join(' ')
                return (
                  <button
                    key={stepEntry.key}
                    type="button"
                    className={classes}
                    aria-current={index === sectionIndex ? 'step' : undefined}
                    onClick={() => goToSection(index)}
                  >
                    <span className="steps-nav__num mono" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="steps-nav__label">{stepEntry.title}</span>
                  </button>
                )
              })}
            </nav>
            <p className="steps-question-count muted">{step.description}</p>
            {isQuestionsSection ? (
              <p className="steps-question-count muted mono">{questionLabel}</p>
            ) : null}
            {isQuestionsSection && stepQuestion !== undefined ? (
              <ReviewQuestionPanel
                key={stepQuestion.id}
                question={stepQuestion}
                label={QUESTION_LABELS[stepQuestion.id]}
                readOnly={!answersEditable}
                error={errorFor(stepQuestion.id)}
                onResponseChange={(questionId, value) =>
                  updateDraft((current) => updateQuestion(current, questionId, value))
                }
              />
            ) : null}
            {step.key === 'overall' ? (
              <RatingReferencePanel />
            ) : null}
            {step.key === 'overall' ? (
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
            ) : null}
            {step.key === 'commitments' ? (
              <ForwardCommitmentsPanel
                commitments={draft.commitments}
                readOnly={!record.commitmentsEditable}
                error={validation?.fieldErrors.commitments ?? null}
                onCommitmentChange={(id, field, value) =>
                  updateDraft((current) => updateCommitment(current, id, field, value))
                }
                onAdd={() => updateDraft(addCommitment)}
                onRemove={(id) => updateDraft((current) => removeCommitment(current, id))}
              />
            ) : null}
            {step.key === 'signoff' ? (
              <SignOffPanel
                employee={draft.employee}
                acknowledged={draft.acknowledged}
                signedAt={record.employeeSignedAt}
                readOnly
              />
            ) : null}
            {!answersEditable ? (
              record.commitmentsEditable ? (
                <Card caption="Submitted — commitments stay open" captionAccent>
                  <p className="muted">
                    Your self-evaluation is read-only now. The forward commitments stay
                    editable until the manager review window closes.
                  </p>
                </Card>
              ) : (
                <Card caption="Submitted" captionAccent>
                  <p className="muted">Your self-evaluation was submitted. The form is read-only now.</p>
                </Card>
              )
            ) : null}
            <div className="form-actions wizard-actions">
              {showPrevious ? (
                <Button variant="ghost" onClick={goToPrevious}>
                  Previous
                </Button>
              ) : null}
              {showNext ? (
                <Button onClick={goToNext}>Next</Button>
              ) : null}
              {answersEditable ? (
                <Button variant="ghost" busy={busy} onClick={() => void autoSave.flush()}>
                  Save draft
                </Button>
              ) : null}
              {!answersEditable && record.commitmentsEditable ? (
                <Button variant="ghost" busy={busy} onClick={() => void autoSave.flush()}>
                  Save commitments
                </Button>
              ) : null}
              {showSubmit ? (
                <Button busy={busy} onClick={submit}>
                  Submit
                </Button>
              ) : null}
            </div>
            <SaveNotice notice={notice} />
          </div>
        </div>
      </div>
    </div>
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

function addCommitment(draft: SelfEvaluationDraft): SelfEvaluationDraft {
  const nextId = draft.commitments.reduce((max, commitment) => Math.max(max, commitment.id), 0) + 1
  return { ...draft, commitments: [...draft.commitments, { id: nextId, commitment: '', support: '' }] }
}

/** The first commitment is compulsory; deletion never empties the list. */
function removeCommitment(draft: SelfEvaluationDraft, id: number): SelfEvaluationDraft {
  const remaining = draft.commitments.filter((commitment) => commitment.id !== id)
  return remaining.length > 0 ? { ...draft, commitments: remaining } : draft
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
