import type { ReactNode } from 'react'

export interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  error?: string | null
  /** A small inline affordance (icon button, tooltip trigger) beside the label. */
  hint?: ReactNode
  children: ReactNode
}

export function FormField({ id, label, required = false, error, hint, children }: FormFieldProps) {
  return (
    <div className="field">
      {hint ? (
        <div className="field__head">
          <label className="field__label" htmlFor={id}>
            {label}
            {required ? <span className="req"> *</span> : null}
          </label>
          {hint}
        </div>
      ) : (
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? <span className="req"> *</span> : null}
        </label>
      )}
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
