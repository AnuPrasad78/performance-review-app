export interface ReviewScoreSelectorProps {
  /** Ordered discrete score values, rendered left to right as chips. */
  values: readonly number[]
  value: number | null
  onChange: (value: number) => void
  ariaLabel: string
  disabled?: boolean
}

export function ReviewScoreSelector({ values, value, onChange, ariaLabel, disabled = false }: ReviewScoreSelectorProps) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {values.map((candidate) => {
        const isActive = candidate === value
        const classes = `chip${isActive ? ' chip--on' : ''}`
        return (
          <button
            key={candidate}
            type="button"
            className={classes}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(candidate)}
          >
            {candidate}
          </button>
        )
      })}
    </div>
  )
}
