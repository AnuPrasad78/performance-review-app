export interface ReviewScoreSelectorProps {
  /** Ordered discrete score values, rendered left to right as chips. */
  values: readonly number[]
  value: number | null
  /** Fired with the picked value; null when the active chip is clicked again (deselect). */
  onChange: (value: number | null) => void
  ariaLabel: string
  disabled?: boolean
  /** Optional per-value explanatory text, revealed on hover and keyboard focus. */
  tooltips?: readonly string[]
}

export function ReviewScoreSelector({
  values,
  value,
  onChange,
  ariaLabel,
  disabled = false,
  tooltips,
}: ReviewScoreSelectorProps) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {values.map((candidate, index) => {
        const isActive = candidate === value
        const tooltip = tooltips?.[index]
        const classes = `chip${isActive ? ' chip--on' : ''}`
        return (
          <button
            key={candidate}
            type="button"
            className={classes}
            aria-label={String(candidate)}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(isActive ? null : candidate)}
          >
            {candidate}
            {tooltip !== undefined && tooltip !== '' ? (
              <span className="chip__tip" role="tooltip">
                {tooltip}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
