import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HeroHeader, type HeroSectionProgress } from '../components/organisms/HeroHeader'
import { ReviewQuestionPanel } from '../components/organisms/ReviewQuestionPanel'
import { OverallRatingPanel } from '../components/organisms/OverallRatingPanel'
import { ForwardCommitmentsPanel } from '../components/organisms/ForwardCommitmentsPanel'
import { SignOffPanel } from '../components/organisms/SignOffPanel'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { todayIsoDate } from '../lib/dates'
import { validateSelfEvaluation } from '../lib/selfEvaluationValidation'
import {
  buildFreshDraft,
  getSelfEvaluation,
  saveSelfEvaluation,
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

const RATING_VALUES: readonly RatingValue[] = [1, 2, 3, 4, 5]
const AUTOSAVE_DEBOUNCE_MS = 800

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
  const [validation, setValidation] = useState<SelfEvaluationValidation | null>(null)
  const [notice, setNotice] = useState<ReviewSaveResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const lastPersistedRef = useRef('')

  useEffect(() => {
    let cancelled = false
    void getSelfEvaluation().then((loaded) => {
      if (cancelled) return
      const resumedSection =
        typeof loaded.lastStepIndex === 'number'
          ? Math.min(Math.max(loaded.lastStepIndex, 0), STEPS.length - 1)
          : 0
      const resumedQuestion =
        typeof loaded.lastQuestionIndex === 'number'
          ? Math.min(Math.max(loaded.lastQuestionIndex, 0), 3)
          : 0
      const initial = stampSignature({ ...loaded, lastStepIndex: resumedSection, lastQuestionIndex: resumedQuestion })
      lastPersistedRef.current = JSON.stringify(initial)
      setSectionIndex(resumedSection)
      setQuestionIndex(resumedQuestion)
      setRecord(initial)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** Edits and page changes persist on their own after a short pause. */
  useEffect(() => {
    if (record === null) return
    const next = stampSignature({ ...record, lastStepIndex: sectionIndex, lastQuestionIndex: questionIndex })
    const json = JSON.stringify(next)
    if (json === lastPersistedRef.current) return
    const timer = setTimeout(() => {
      lastPersistedRef.current = json
      void saveSelfEvaluation(next).then((savedResult) => {
        if (!savedResult.ok) return
        if (next.employeeSignedAt !== record.employeeSignedAt) setRecord(next)
      })
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [record, sectionIndex, questionIndex])

  if (record === null) {
    return (
      <div className="hero-page">
        <div className="hero-card brand-frame">
          <HeroHeader sectionProgress={[]} />
          <div className="hero-card__body">
            <p className="muted">Loading your review.</p>
          </div>
        </div>
      </div>
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

  const step = STEPS[Math.min(Math.max(sectionIndex, 0), STEPS.length - 1)]
  if (step === undefined) return null
  const isQuestionsSection = sectionIndex === 0
  const isLastSection = sectionIndex === STEPS.length - 1
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
  const showNext = !isLastSection || isQuestionsSection
  const showSubmit = isLastSection && !readOnly

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
      setNotice({ ok: false, error: 'Complete the flagged fields before submitting.' })
      return
    }
    const submittedRecord = stampSignature({
      ...record,
      draft,
      submittedAt: todayIsoDate(),
      lastStepIndex: sectionIndex,
      lastQuestionIndex: questionIndex,
    })
    setSaving(true)
    lastPersistedRef.current = JSON.stringify(submittedRecord)
    void saveSelfEvaluation(submittedRecord).then((savedResult) => {
      setNotice(savedResult.ok ? null : savedResult)
      if (savedResult.ok) setRecord(submittedRecord)
      setSaving(false)
    })
  }

  /** A section counts as done only when every field in it is filled. */
  const questionsDone = draft.questions.every((q) => q.employeeResponse.trim() !== '')
  const overallDone = draft.overallRating !== null && draft.overallSummary.trim() !== ''
  const commitmentDone = draft.commitments[0]?.commitment.trim() !== '' && draft.commitments[0]?.support.trim() !== ''
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
        <nav className="steps-nav" aria-label="Review sections">
          {STEPS.map((stepEntry, index) => {
            const classes = [
              'steps-nav__step',
              index === sectionIndex ? 'is-active' : '',
            ]
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
        {isQuestionsSection ? (
          <p className="steps-question-count muted mono">{questionLabel}</p>
        ) : null}
        {isQuestionsSection && stepQuestion !== undefined ? (
          <ReviewQuestionPanel
            key={stepQuestion.id}
            question={stepQuestion}
            label={QUESTION_LABELS[stepQuestion.id]}
            readOnly={readOnly}
            error={errorFor(stepQuestion.id)}
            onResponseChange={(questionId, value) =>
              updateDraft((current) => updateQuestion(current, questionId, value))
            }
          />
        ) : null}
        {!isQuestionsSection && step.key === 'overall' ? (
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
        ) : null}
        {step.key === 'commitments' ? (
          <ForwardCommitmentsPanel
            commitments={draft.commitments}
            readOnly={readOnly}
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
            readOnly={readOnly}
            onAcknowledgeChange={(acknowledged) => updateDraft((current) => ({ ...current, acknowledged }))}
          />
        ) : null}
        {readOnly && isLastSection ? (
          <Card caption="Submitted" captionAccent>
            <p className="muted">
              Your self-evaluation was submitted on {record.submittedAt}. The form is read-only now.
            </p>
          </Card>
        ) : null}
        <div className="form-actions wizard-actions">
          {showPrevious ? (
            <Button variant="ghost" onClick={goToPrevious}>
              Previous
            </Button>
          ) : null}
          {showNext ? (
            <Button onClick={goToNext}>Next</Button>
          ) : showSubmit ? (
            <Button busy={saving} onClick={submit}>
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
