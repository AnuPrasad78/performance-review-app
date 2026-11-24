import { SessionMenu } from './SessionMenu'
import logoUrl from '../../assets/emids-logo.svg'

export interface HeroSectionProgress {
  label: string
  value: string
}

export interface HeroHeaderProps {
  /** Per-section progress, shown row by row in the hero. */
  sectionProgress: readonly HeroSectionProgress[]
}

export function HeroHeader({ sectionProgress }: HeroHeaderProps) {
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
      </div>
      <div className="hero__side">
        <div className="hero__foot">
          <SessionMenu />
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
