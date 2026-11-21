import { Card } from '../atoms/Card'
import { ProgressMeter } from '../molecules/ProgressMeter'

export interface ReviewProgressCardProps {
  sectionsCompleted: number
  sectionsTotal: number
}

export function ReviewProgressCard({ sectionsCompleted, sectionsTotal }: ReviewProgressCardProps) {
  const percent = sectionsTotal === 0 ? 0 : Math.round((sectionsCompleted / sectionsTotal) * 100)
  if (sectionsTotal === 0) return null
  return (
    <Card caption="Review form progress" captionAccent>
      <ProgressMeter
        label="SECTIONS COMPLETED"
        percent={percent}
        valueLabel={`${sectionsCompleted}/${sectionsTotal}`}
      />
    </Card>
  )
}
