export interface ProgressMeterProps {
  label: string
  /** Completed portion of the whole, shown as a percentage 0–100. */
  percent: number
  valueLabel: string
}

export function ProgressMeter({ label, percent, valueLabel }: ProgressMeterProps) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="bar-row">
      <span className="bar-row__label mono">{label}</span>
      <div
        className="bar-row__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label}
      >
        <div className="bar-row__fill" style={{ width: `${clamped}%` }} />
      </div>
      <span className="bar-row__value mono">{valueLabel}</span>
    </div>
  )
}
