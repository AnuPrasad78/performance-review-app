import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLElement> {
  caption?: string
  captionAccent?: boolean
  children: ReactNode
}

export function Card({ caption, captionAccent = false, className, children, ...rest }: CardProps) {
  const classes = ['card', 'card--padded', 'brand-frame', className ?? ''].filter(Boolean).join(' ')
  return (
    <section className={classes} {...rest}>
      {caption ? <h2 className={captionAccent ? 'card__caption card__caption--accent' : 'card__caption'}>{caption}</h2> : null}
      {children}
    </section>
  )
}
