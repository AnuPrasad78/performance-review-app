import { Button } from '../atoms/Button'
import { Card } from '../atoms/Card'
import { ProgressMeter } from '../molecules/ProgressMeter'
import { StatStrip, type StatItem } from '../molecules/StatStrip'
import { EmployeeProfileCard } from './EmployeeProfileCard'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface EmployeeDashboardHomeProps {
  employee: SelfEvaluationEmployee
  stats: readonly StatItem[]
  statusLabel: string
  statusTone: 'approved' | 'pending' | 'cancelled'
  deadline: string
  sectionsCompleted: number
  sectionsTotal: number
  onOpenSelfEvaluation: () => void
}

export function EmployeeDashboardHome({
  employee,
  stats,
  statusLabel,
  statusTone,
  deadline,
  sectionsCompleted,
  sectionsTotal,
  onOpenSelfEvaluation,
}: EmployeeDashboardHomeProps) {
  const percent = sectionsTotal === 0 ? 0 : Math.round((sectionsCompleted / sectionsTotal) * 100)
  return (
    <div className="page-stack">
      <StatStrip stats={stats} />
      <EmployeeProfileCard employee={employee} />
      <div className="dashboard-progress">
        {sectionsTotal > 0 ? (
          <Card caption="Review form progress" captionAccent>
            <ProgressMeter
              label="SECTIONS COMPLETED"
              percent={percent}
              valueLabel={`${sectionsCompleted}/${sectionsTotal}`}
            />
          </Card>
        ) : null}
      </div>
      <div className="dashboard-cta">
        <Button onClick={onOpenSelfEvaluation}>Open self-evaluation</Button>
        <span className={`pill pill--${statusTone}`}>
          {statusLabel}
        </span>
        <span className="dashboard-cta__deadline mono">
          Deadline {deadline}
        </span>
      </div>
    </div>
  )
}
