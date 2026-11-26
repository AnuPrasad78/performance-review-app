import { useEffect, useRef, useState, type ReactNode } from 'react'
import { HeroHeader, type HeroSectionProgress } from '../components/organisms/HeroHeader'

import { ReviewQuestionPanel } from '../components/organisms/ReviewQuestionPanel'
import { OverallRatingPanel } from '../components/organisms/OverallRatingPanel'
import { ForwardCommitmentsPanel } from '../components/organisms/ForwardCommitmentsPanel'
import { SignOffPanel } from '../components/organisms/SignOffPanel'
import { Button } from '../components/atoms/Button'
import { Card } from '../components/atoms/Card'
import { Modal } from '../components/molecules/Modal'
import { saveSelfEvaluation, submitSelfEvaluation, fetchSelfEvaluation } from '../lib/api'
import { daysUntilDeadlineUtc } from '../lib/dates'
import { downloadSelfEvaluationPdf } from '../lib/selfEvaluationPdf'
import { ReviewPreviewPanel } from '../components/organisms/ReviewPreviewPanel'
import { useDeadlineClock } from '../hooks/useDeadlineClock'
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
import { QUESTION_LABELS } from '../lib/selfEvaluationContent'
import { useAutoSave } from '../hooks/useAutoSave'
import type {
  AssessmentQuestionId,
  ForwardCommitment,
  RatingValue,
  SelfEvaluationDraft,
  SelfEvaluationValidation,
} from '../lib/types'

const RATING_VALUES: readonly RatingValue[] = [5, 4, 3, 2, 1]
const AUTO_SAVE_DELAY_MS = 1200

/** The four numbered review sections of the wizard. */
interface WizardStep {
  key: 'questions' | 'overall' | 'commitments' | 'signoff'
  title: string
  description: string
}

const STEPS: readonly WizardStep[] = [
  {
    key: 'questions',
    title: 'Self Evaluation',
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
    title: 'Sign-Off',
    description:
      'Sign-off confirms the review discussion took place and the rating and comments were shared with you.',
  },
]

export function EmployeeDashboardPage() {
  const now = useDeadlineClock()
  const [record, setRecord] = useState<SelfEvaluationRecord | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notEligible, setNotEligible] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [validation, setValidation] = useState<SelfEvaluationValidation | null>(null)
  const [confirmingSubmit, setConfirmingSubmit] = useState(false)
  const [submitOutcome, setSubmitOutcome] = useState<'success' | 'failed' | null>(null)
  const [sectionIndex, setSectionIndex] = useState(0)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [previewing, setPreviewing] = useState(false)
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
    onError: (detail) => setNotice(`Save failed — ${detail}`),
  })

  useEffect(() => {
    let cancelled = false
    void fetchSelfEvaluation().then((result) => {
      if (cancelled) return
      if (result.ok) {
        const initial = recordFromApi(result.data)
        // Resume position is per-employee, keyed by the record's own identity.
        const resume = loadResumeIndices(result.data.employee.email)
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
      } else if (result.code === 'not_eligible') {
        // The cycle's joining-date cutoff: the welcome the recent joiner
        // sees at sign-in, in the server's own wording.
        setNotEligible(result.detail)
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
    saveResumeIndices(record.draft.employee.email, indices)
  }, [record, sectionIndex, questionIndex])

  if (notEligible !== null) {
    return (
      <div className="hero-page">
        <div className="hero-card brand-frame">
          <HeroHeader sectionProgress={[]} />
          <div className="hero-card__body">
            <Card caption="Welcome to emids" captionAccent>
              <p>{notEligible}</p>
            </Card>
          </div>
        </div>
      </div>
    )
  }

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

  // The server's deadline verdict decides what this page is at all: an open,
  // unsubmitted review past its moment renders the closed state instead of
  // the wizard. An already-submitted review keeps its submitted view — the
  // freeze, and the commitments window, are its own rules.
  if (record.deadlinePassed && record.submittedAt === null) {
    return (
      <div className="hero-page">
        <div className="hero-card brand-frame">
          <HeroHeader sectionProgress={[]} />
          <div className="hero-card__body">
            <Card caption="Submission closed" captionAccent>
              <p className="deadline-closed">ops time passed</p>
            </Card>
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

  /** Edits land in local state; the hook decides when they go to the API.
      A fresh edit clears the validation display — the next Submit click
      re-runs the rules. */
  const updateDraft = (mutate: (draft: SelfEvaluationDraft) => SelfEvaluationDraft): void => {
    setRecord((current) =>
      current === null ? current : { ...current, draft: mutate(current.draft) },
    )
    setValidation(null)
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
    // Navigation is free; only Submit runs the validation rules.
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

  /** Send the reader to the first unanswered mandatory item, so the "Mandatory
      field" errors written by openPreview/submit are where the eyes are. */
  const jumpToFirstInvalid = (outcome: SelfEvaluationValidation): void => {
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
    }
  }

  /** Preview opens from the sign-off step only; an open review must first be
      mandatory-complete, exactly like submitting. */
  const openPreview = (): void => {
    if (answersEditable) {
      const outcome = validateSelfEvaluation(draft)
      if (!outcome.isValid) {
        setValidation(outcome)
        jumpToFirstInvalid(outcome)
        setNotice('Complete the flagged fields before submitting.')
        return
      }
    }
    setValidation(null)
    setPreviewing(true)
  }

  const goToEdit = (): void => {
    setPreviewing(false)
    setSectionIndex(0)
    setQuestionIndex(0)
  }

  /** Save immediately, then submit — an un-flushed draft would submit
      incomplete even though the form looks complete locally. A preamble save
      that fails stops the submission: the server never saw the draft, so its
      verdict on what "complete" means would read a stale record. */
  const submit = (): void => {
    const outcome = validateSelfEvaluation(draft)
    setValidation(outcome)
    if (!outcome.isValid) {
      jumpToFirstInvalid(outcome)
      setNotice('Complete the flagged fields before submitting.')
      return
    }
    setSubmitting(true)
    void autoSave
      .flush()
      .then((saveOutcome) => {
        if (saveOutcome !== null && !saveOutcome.ok) {
          // The preamble save failed: the server never saw the draft, so the
          // submission must not fire. onError already surfaced the save's
          // own detail; the popup states the submission never completed.
          setSubmitOutcome('failed')
          return null
        }
        return submitSelfEvaluation()
      })
      .then((result) => {
        if (result === null) return
        if (result.ok) {
          setRecord(mergeRecordFromApi(recordRef.current ?? record, result.data))
          setNotice('Submitted successfully.')
          setSubmitOutcome('success')
        } else {
          setNotice(result.detail)
          setSubmitOutcome('failed')
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

  // Banner only while the form is both open and unsubmitted — a submitted
  // review has nothing left to close.
  const deadline =
    record.submittedAt === null ? { daysRemaining: daysUntilDeadlineUtc(record.submissionDeadline, now) } : null
  return (
    <div className="hero-page">
      <div className="hero-card brand-frame">
        <HeroHeader sectionProgress={sectionProgress} profile={draft.employee} deadline={deadline} />
        <div className="hero-card__body">
          <div className="page-stack">
            {previewing ? (
              <>
                <ReviewPreviewPanel draft={draft} signedAt={record.employeeSignedAt} />
                <div className="form-actions wizard-actions">
                  {answersEditable ? (
                    <Button variant="ghost" onClick={goToEdit}>
                      Edit
                    </Button>
                  ) : null}
                  {answersEditable ? (
                    <Button busy={busy} onClick={() => setConfirmingSubmit(true)}>
                      Submit
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    busy={busy}
                    disabled={record.submittedAt === null}
                    onClick={() =>
                      downloadSelfEvaluationPdf(
                        draft,
                        record.employeeSignedAt ?? record.submittedAt,
                        'Self Evaluation',
                      )
                    }
                  >
                    Download
                  </Button>
                </div>
              </>
            ) : (
              <>
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
                signedAt={record.employeeSignedAt}
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
                <Button onClick={goToNext}>
                  Next
                </Button>
              ) : null}
              {answersEditable ? (
                <Button variant="ghost" busy={busy} onClick={() => void autoSave.flush()}>
                  Save draft
                </Button>
              ) : null}
              {!answersEditable && record.commitmentsEditable && step.key === 'commitments' ? (
                <Button variant="ghost" busy={busy} onClick={() => void autoSave.flush()}>
                  Save commitments
                </Button>
              ) : null}
              {isLastSection ? (
                <Button variant="ghost" onClick={openPreview}>
                  Preview
                </Button>
              ) : null}
                </div>
              </>
            )}
            {step.key === 'commitments' || previewing || (validation !== null && !validation.isValid) ? (
              <SaveNotice notice={notice} />
            ) : null}
          </div>
        </div>
      </div>
      <Modal
        open={confirmingSubmit}
        label="Confirm submission"
        onClose={() => setConfirmingSubmit(false)}
      >
        <div className="modal__body">
          <p>
            Once submitted, your self-evaluation can no longer be edited by you. It
            goes to your manager for the review discussion and sign-off.
          </p>
        </div>
        <div className="modal__actions">
          <Button variant="ghost" onClick={() => setConfirmingSubmit(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setConfirmingSubmit(false)
              submit()
            }}
          >
            OK
          </Button>
        </div>
      </Modal>
      <Modal
        open={submitOutcome === 'success'}
        label="Submission complete"
        onClose={() => setSubmitOutcome(null)}
      >
        <div className="modal__body">
          <p>Your self-evaluation was submitted successfully.</p>
          <p className="muted">Your self-evaluation form is now downloadable.</p>
          <p className="muted">
            It is with your manager for the review discussion and sign-off.
          </p>
        </div>
        <div className="modal__actions">
          <Button onClick={() => setSubmitOutcome(null)}>OK</Button>
        </div>
      </Modal>
      <Modal
        open={submitOutcome === 'failed'}
        label="Submission failed"
        onClose={() => setSubmitOutcome(null)}
      >
        <div className="modal__body">
          <p>Your self-evaluation was not submitted. Please try again.</p>
          {notice !== null ? (
            <p className="muted">{notice}</p>
          ) : null}
        </div>
        <div className="modal__actions">
          <Button onClick={() => setSubmitOutcome(null)}>OK</Button>
        </div>
      </Modal>
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