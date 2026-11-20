export interface ToastProps {
  tone: 'success' | 'error'
  message: string
}

export function Toast({ tone, message }: ToastProps) {
  const classes = tone === 'error' ? 'toast toast--red' : 'toast'
  return (
    <div role="status" aria-live="polite" className={classes}>
      <span className="toast__dot" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}
