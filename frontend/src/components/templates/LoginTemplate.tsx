import type { ReactNode } from 'react'
import { Icon, type IconName } from '../atoms/Icon'
import logoUrl from '../../assets/emids-logo.svg'

const FEATURES: ReadonlyArray<{ icon: IconName; label: string }> = [
  { icon: 'user', label: 'Write and submit self-assessments' },
  { icon: 'chart', label: 'Track your review progress' },
  { icon: 'users', label: 'Reviewer feedback and sign-off' },
  { icon: 'lock', label: 'Confidential and secure workspace' },
]

/** Sign-in layout: dark program panel on the left, light pane with the form
    card on the right. Static presentation only — no data fetching. */
export function LoginTemplate({ children }: { children: ReactNode }) {
  return (
    <main className="login">
      <aside className="login__brand">
        <svg
          className="login__nodes"
          viewBox="0 0 700 900"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <g fill="none" stroke="rgba(88, 214, 189, 0.22)" strokeWidth="1" strokeDasharray="3 7">
            <path d="M430 120 L610 240 L560 420" />
            <path d="M610 240 L470 330 L430 120" />
            <path d="M250 420 L470 330 L250 420" />
            <path d="M250 420 L310 640" />
            <path d="M470 330 L560 420" />
          </g>
          <g fill="none" stroke="rgba(88, 214, 189, 0.3)" strokeWidth="1.5">
            <circle cx="430" cy="120" r="14" />
            <circle cx="610" cy="240" r="10" />
            <circle cx="560" cy="420" r="18" />
            <circle cx="470" cy="330" r="7" />
            <circle cx="250" cy="420" r="11" />
            <circle cx="310" cy="640" r="14" />
          </g>
        </svg>
        <div className="login__brand-copy">
          <header className="login__wordmark">
            <img src={logoUrl} alt="emids" className="login__wordmark-logo" />
            <span className="login__program">Performance Review</span>
          </header>
          <h2 className="login__title">
            Elevate your
            <br />
            <span className="login__title-accent">impact.</span>
          </h2>
          <ul className="login__features">
            {FEATURES.map((feature) => (
              <li key={feature.label} className="login__feature">
                <span className="login__feature-icon" aria-hidden="true">
                  <Icon name={feature.icon} size={15} />
                </span>
                {feature.label}
              </li>
            ))}
          </ul>
        </div>
      </aside>
      <section className="login__pane">
        <div className="login__card">{children}</div>
      </section>
    </main>
  )
}
