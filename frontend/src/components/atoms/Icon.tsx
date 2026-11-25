import type { ReactNode } from 'react'

export type IconName =
  | 'menu'
  | 'close'
  | 'mail'
  | 'users'
  | 'upload'
  | 'calendar'
  | 'eye'
  | 'eye-off'
  | 'logout'
  | 'lock'
  | 'check'
  | 'chevron-down'
  | 'user'
  | 'plus'
  | 'minus'
  | 'chart'
  | 'clock'
  | 'circle-check'
  | 'alert'
  | 'info'

const GLYPHS: Record<IconName, ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  user: (
    <>
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M4.5 20.5c0-4.125 3.375-7 7.5-7s7.5 2.875 7.5 7" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v6" />
      <path d="M16 3.9a3 3 0 0 1 0 5.2" />
      <path d="M21 21v-6a2 2 0 0 0-2-2h-1" />
    </>
  ),
  upload: (
    <>
      <path d="M4 16v5h16v-5" />
      <path d="M12 15V4" />
      <path d="m9 7 3-3 3 3" />
    </>
  ),
  calendar: (
    <>
      <path d="M6 4h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      <path d="M16 3v4M8 3v4M4 11h16" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M6 11.5c-2.4 1.9-4 4-4 4.5" />
      <path d="M2 4l18 16" />
      <path d="M9.9 5.1A10.3 10.3 0 0 1 12 5c6.2 0 10 6 10 6s-1.4 2.2-3.6 3.9" />
      <path d="M6.1 11.4a17.6 17.6 0 0 0-3.6 4.1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M10.5 5.6c.5-.1 1-.1 1.5-.1" />
    </>
  ),
  logout: (
    <>
      <path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
      <path d="M10 8l-4 4 4 4" />
      <path d="M6 12h10" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="1" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <path d="M12 14.5v2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M9 16v-5M13 16v-8M17 16v-3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  'circle-check': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
}

export interface IconProps {
  name: IconName
  size?: number
  className?: string
}

export function Icon({ name, size = 16, className }: IconProps) {
  return (
    <svg
      className={className !== undefined ? `${className} icon` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name]}
    </svg>
  )
}
