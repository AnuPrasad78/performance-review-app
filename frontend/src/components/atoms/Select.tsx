import type { ChangeEvent } from 'react'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value: string
  options: readonly SelectOption[]
  /** The chosen value; the atom stays generic — domain words live upstream. */
  onChange: (value: string) => void
  ariaLabel: string
  /** Extra sizing/spacing hooks (`.select` itself carries the control chrome). */
  className?: string
}

export function Select({ value, options, onChange, ariaLabel, className }: SelectProps) {
  const classes = ['select', className ?? ''].filter(Boolean).join(' ')
  const choose = (event: ChangeEvent<HTMLSelectElement>): void => {
    onChange(event.target.value)
  }
  return (
    <select className={classes} value={value} aria-label={ariaLabel} onChange={choose}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
