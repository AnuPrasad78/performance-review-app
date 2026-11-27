
export interface HeroSectionProgress {
  label: string
  value: string
}

/** The submission-window banner, while the form is still open. */
export interface HeroDeadline {
  daysRemaining: number
}

export interface HeroHeaderProps {
  /** Time-of-day welcome line shown above the title. */
  greeting?: string | null
  /** Per-section progress, shown row by row in the hero. */
  sectionProgress: readonly HeroSectionProgress[]
  /** Submission countdown for the open form; absent once submitted or closed. */
  deadline?: HeroDeadline | null
}

export function HeroHeader({ greeting, sectionProgress, deadline }: HeroHeaderProps) {
  return (
    <header className="hero">
      <div className="hero__lead">
        {greeting ? <p className="hero__greeting">{greeting}</p> : null}
        <h1 className="hero__title">Annual Performance Review 2026</h1>
        <p className="hero__subtitle">Employee Self-Evaluation &amp; Manager Assessment</p>
        <p className="hero__meta">Performance period: 1-Jan-2026 to 31-Dec-2026</p>
      </div>
      {deadline || sectionProgress.length > 0 ? (
        <div className="hero__cards">
          {deadline ? (
            <p className="hero__card hero__deadline" role="status">
              <span className="hero__deadline-tagline">Your Growth. Our Success! 🚀</span>
              <span className="hero__deadline-count">
                {deadline.daysRemaining} {deadline.daysRemaining === 1 ? 'Day' : 'Days'} Left
              </span>
              <span className="hero__deadline-action">Complete your self-evaluation.</span>
            </p>
          ) : null}
          {sectionProgress.length > 0 ? (
            <dl className="hero__card hero__status-list" aria-label="Progress by section">
              {sectionProgress.map((item) => (
                <div key={item.label} className="hero__status-row">
                  <dt className="hero__status-label">{item.label.toUpperCase()}</dt>
                  <dd className="hero__status-value">{item.value.toUpperCase()}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      ) : null}
    </header>
  )
}
