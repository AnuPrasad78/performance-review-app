import { useEffect, useState, type ReactNode } from 'react'
import { DashboardTemplate } from '../components/templates/DashboardTemplate'
import { EmployeeDashboardHome } from '../components/organisms/EmployeeDashboardHome'
import { useAdminStore } from '../state/AdminContext'
import { formatIsoDate } from '../lib/dates'
import { DEFAULT_SUBMISSION_DEADLINE } from '../lib/selfEvaluationContent'
import {
  getSelfEvaluation,
  MOCK_EMPLOYEE,
  type SelfEvaluationRecord,
} from '../lib/selfEvaluationStore'

const HEAD_EYEBROW = 'Annual performance review 2026'

export function EmployeeDashboardPage() {
  const { cycleSettings } = useAdminStore()
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
      <DashboardTemplate eyebrow={HEAD_EYEBROW} title="My review" lead={leadLine}>
        <p className="muted">Loading your review.</p>
      </DashboardTemplate>
    )
  }

  return (
    <DashboardTemplate eyebrow={HEAD_EYEBROW} title="My review" lead={leadLine}>
      <EmployeeDashboardHome
        employee={MOCK_EMPLOYEE}
        sectionsCompleted={completedSections(record.draft)}
        sectionsTotal={7}
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
