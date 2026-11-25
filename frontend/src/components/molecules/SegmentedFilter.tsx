import type { ReactNode } from 'react'

export interface SegmentedOption<Value extends string | number> {
  value: Value
  label: ReactNode
}

export interface SegmentedFilterProps<Value extends string | number> {
  options: readonly SegmentedOption<Value>[]
  value: Value | null
  onChange: (value: Value) => void
  ariaLabel: string
  disabled?: boolean
}

/** The shared chip / segmented control (ui.md §4.1); domain components wrap it. */
export function SegmentedFilter<Value extends string | number>({
  options,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: SegmentedFilterProps<Value>) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className={`chip${isActive ? ' chip--on' : ''}`}
            aria-pressed={isActive}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
