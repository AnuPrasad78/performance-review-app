import type { ReactNode } from 'react'

export interface FormFieldProps {
  id: string
  label: string
  required?: boolean
  error?: string | null
  children: ReactNode
}

export function FormField({ id, label, required = false, error, children }: FormFieldProps) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="req"> *</span> : null}
      </label>
      {children}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
}
