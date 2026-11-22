import type { ReactNode } from 'react'

export interface ReviewSectionHeadingProps {
  number: number
  title: string
  /** Sentence-case lead line printed under the band. */
  description?: string
  children?: ReactNode
}

export function ReviewSectionHeading({ number, title, description, children }: ReviewSectionHeadingProps) {
  return (
    <div className="section-head">
      <h2 className="section-band">
        {number}. {title}
      </h2>
      {description ? <p className="section-head__desc muted">{description}</p> : null}
      {children}
    </div>
  )
}
