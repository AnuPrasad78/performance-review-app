import type { ReactNode } from 'react'

export interface DashboardTemplateProps {
  eyebrow: string
  title: string
  lead: ReactNode
  children: ReactNode
}

export function DashboardTemplate({ eyebrow, title, lead, children }: DashboardTemplateProps) {
  return (
    <div className="page">
      <div className="page-head">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      <div className="page-stack">{children}</div>
    </div>
  )
}
