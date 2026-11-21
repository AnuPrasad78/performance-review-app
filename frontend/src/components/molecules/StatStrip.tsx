import type { ReactNode } from 'react'

export interface StatItem {
  key: string
  label: string
  value: ReactNode
}

export interface StatStripProps {
  stats: readonly StatItem[]
}

export function StatStrip({ stats }: StatStripProps) {
  return (
    <div className="strip" role="group" aria-label="Review summary">
      {stats.map((stat) => (
        <div key={stat.key} className="strip__stat">
          <span className="strip__label mono">{stat.label}</span>
          <span className="strip__value">{stat.value}</span>
        </div>
      ))}
    </div>
  )
}
