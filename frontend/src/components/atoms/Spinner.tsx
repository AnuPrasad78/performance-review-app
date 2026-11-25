export interface SpinnerProps {
  tone?: 'light' | 'teal'
  size?: number
}

export function Spinner({ tone = 'light', size = 16 }: SpinnerProps) {
  const classes = tone === 'teal' ? 'spinner spinner--teal' : 'spinner'
  return <span className={classes} style={{ width: size, height: size }} aria-hidden="true" />
}
