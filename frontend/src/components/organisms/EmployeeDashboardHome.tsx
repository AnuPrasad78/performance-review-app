import { Card } from '../atoms/Card'
import { ProgressMeter } from '../molecules/ProgressMeter'
import { EmployeeProfileCard } from './EmployeeProfileCard'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface EmployeeDashboardHomeProps {
  employee: SelfEvaluationEmployee
  sectionsCompleted: number
  sectionsTotal: number
}

export function EmployeeDashboardHome({
  employee,
  sectionsCompleted,
  sectionsTotal,
}: EmployeeDashboardHomeProps) {
  const percent = sectionsTotal === 0 ? 0 : Math.round((sectionsCompleted / sectionsTotal) * 100)
  return (
    <div className="page-stack">
      {sectionsTotal > 0 ? (
        <Card caption="Review form progress" captionAccent>
          <ProgressMeter
            label="SECTIONS COMPLETED"
            percent={percent}
            valueLabel={`${sectionsCompleted}/${sectionsTotal}`}
          />
        </Card>
      ) : null}
      <EmployeeProfileCard employee={employee} />
    </div>
  )
}
