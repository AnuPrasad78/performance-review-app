import type { ReactNode } from 'react'

export interface AdminTemplateProps {
  eyebrow: string
  title: string
  lead: string
  children: ReactNode
}

export function AdminTemplate({ eyebrow, title, lead, children }: AdminTemplateProps) {
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
