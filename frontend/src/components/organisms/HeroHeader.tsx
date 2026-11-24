import { SessionMenu } from './SessionMenu'
import logoUrl from '../../assets/emids-logo.svg'
import type { Employee } from '../../lib/types'

export interface HeroSectionProgress {
  label: string
  value: string
}

/** The submission-window banner, while the form is still open. */
export interface HeroDeadline {
  daysRemaining: number
}

export interface HeroHeaderProps {
  /** Per-section progress, shown row by row in the hero. */
  sectionProgress: readonly HeroSectionProgress[]
  /** The signed-in employee's roster row, when the page has it; the session
      menu popover falls back to its mock lookup without it. */
  profile?: Employee | null
  /** Submission countdown for the open form; absent once submitted or closed. */
  deadline?: HeroDeadline | null
}

export function HeroHeader({ sectionProgress, profile, deadline }: HeroHeaderProps) {
  return (
    <header className="hero">
      <div className="hero__lead">
        <div className="hero__brand">
          <img className="hero__brand-logo" src={logoUrl} alt="Emids" />
          <span className="hero__brand-divider" aria-hidden="true" />
          <span className="hero__brand-label">Talent &amp; Culture</span>
        </div>
        <h1 className="hero__title">Annual Performance Review 2026</h1>
        <p className="hero__subtitle">Employee Self-Evaluation &amp; Manager Assessment</p>
        <p className="hero__meta">Performance period: 1-Jan-2026 to 31-Dec-2026</p>
        {deadline ? (
          <p className="hero__deadline" role="status">
            The form will close in {deadline.daysRemaining}{' '}
            {deadline.daysRemaining === 1 ? 'day' : 'days'}. Fill it up soon.
          </p>
        ) : null}
      </div>
      <div className="hero__side">
        <div className="hero__foot">
          <SessionMenu profile={profile} />
          {sectionProgress.length > 0 ? (
            <dl className="hero__status-list mono" aria-label="Progress by section">
              {sectionProgress.map((item) => (
                <div key={item.label} className="hero__status-row">
                  <dt className="hero__status-label">{item.label.toUpperCase()}</dt>
                  <dd className="hero__status-value">{item.value.toUpperCase()}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </header>
  )
}
