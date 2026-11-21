import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { EmployeeDashboardHome } from '../components/organisms/EmployeeDashboardHome'
import { useAdminStore } from '../state/AdminContext'
import { daysUntil, formatIsoDate } from '../lib/dates'
import { DEFAULT_SUBMISSION_DEADLINE } from '../lib/selfEvaluationContent'
import {
  deriveReviewStatus,
  getSelfEvaluation,
  MOCK_EMPLOYEE,
  REVIEW_STATUS_LABELS,
  reviewStatusTone,
  type SelfEvaluationRecord,
} from '../lib/selfEvaluationStore'
import type { StatItem } from '../components/molecules/StatStrip'

const HEAD_EYEBROW = 'Annual performance review 2026'

export function EmployeeDashboardPage() {
  const { cycleSettings } = useAdminStore()
  const navigate = useNavigate()
  const [record, setRecord] = useState<SelfEvaluationRecord | null>(null)

  useEffect(() => {
    let cancelled = false
    void getSelfEvaluation().then((loaded) => {
      if (!cancelled) setRecord(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const leadLine = `Self-evaluation due ${
    formatIsoDate(cycleSettings?.submissionDeadline ?? DEFAULT_SUBMISSION_DEADLINE)
  }.`

  if (record === null) {
    return (
      <DashboardTemplate eyebrow={HEAD_EYEBROW} title="My review" lead={leadLine}>
        <p className="muted">Loading your review.</p>
      </DashboardTemplate>
    )
  }

  const status = deriveReviewStatus(record)
  const draft = record.draft
  const deadline = cycleSettings?.submissionDeadline ?? DEFAULT_SUBMISSION_DEADLINE
  const daysLeft = Math.max(0, daysUntil(deadline))
  const selfRatingText = draft !== null && draft.overallRating !== null ? 'Set' : 'Not set'
  const signOffText = record.employeeSignedAt !== null ? 'Signed' : 'Not signed'
  const stats: readonly StatItem[] = [
    { key: 'status', label: 'REVIEW STATUS', value: REVIEW_STATUS_LABELS[status] },
    { key: 'days-left', label: 'DAYS TO DEADLINE', value: String(daysLeft) },
    { key: 'self-rating', label: 'SELF-RATING', value: selfRatingText },
    { key: 'sign-off', label: 'SIGN-OFF', value: signOffText },
  ]
  return (
    <DashboardTemplate eyebrow={HEAD_EYEBROW} title="My review" lead={leadLine}>
      <EmployeeDashboardHome
        employee={MOCK_EMPLOYEE}
        stats={stats}
        statusLabel={REVIEW_STATUS_LABELS[status]}
        statusTone={reviewStatusTone(status)}
        deadline={formatIsoDate(deadline)}
        sectionsCompleted={completedSections(draft)}
        sectionsTotal={7}
        onOpenSelfEvaluation={() => navigate('/self-evaluation')}
      />
    </DashboardTemplate>
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
