import type { ButtonHTMLAttributes } from 'react'
import { Spinner } from './Spinner'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  size?: 'default' | 'sm'
  busy?: boolean
}

export function Button({ variant = 'primary', size = 'default', busy = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  const classes = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button type={type} className={classes} disabled={busy || disabled === true} {...rest}>
      {busy ? <Spinner tone={variant === 'ghost' ? 'teal' : 'light'} /> : null}
      {children}
    </button>
  )
}
