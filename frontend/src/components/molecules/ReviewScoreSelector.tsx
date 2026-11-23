import { SegmentedFilter } from './SegmentedFilter'
import type { SegmentedFilterProps } from './SegmentedFilter'

export interface ReviewScoreSelectorProps {
  /** Ordered discrete score values, rendered left to right as chips. */
  values: readonly number[]
  value: number | null
  onChange: (value: number) => void
  ariaLabel: string
  disabled?: boolean
}

export function ReviewScoreSelector({
  values,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: ReviewScoreSelectorProps) {
  const options: SegmentedFilterProps<number>['options'] = values.map((score) => ({
    value: score,
    label: String(score),
  }))
  return (
    <SegmentedFilter options={options} value={value} onChange={onChange} ariaLabel={ariaLabel} disabled={disabled} />
  )
}
