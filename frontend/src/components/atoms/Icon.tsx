import type { ReactNode } from 'react'

export type IconName = 'menu' | 'close' | 'users' | 'upload' | 'calendar'

const GLYPHS: Record<IconName, ReactNode> = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
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
}

export interface IconProps {
  name: IconName
  size?: number
}

export function Icon({ name, size = 16 }: IconProps) {
  return (
    <svg
      className="icon"
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
