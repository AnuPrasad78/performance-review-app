import type { TextareaHTMLAttributes } from 'react'

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const classes = ['textarea', className ?? ''].filter(Boolean).join(' ')
  return <textarea className={classes} {...rest} />
}
