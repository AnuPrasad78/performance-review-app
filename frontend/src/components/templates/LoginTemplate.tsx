import type { ReactNode } from 'react'
import logoUrl from '../../assets/emids-logo.svg'

/** Sign-in layout: white form card over a light left pane, gradient program
    panel on the right. Static presentation only — no data fetching. */
export function LoginTemplate({ children }: { children: ReactNode }) {
  return (
    <main className="login">
      <section className="login__left">
        <header className="login__wordmark">
          <img src={logoUrl} alt="emids" className="login__wordmark-logo" />
        </header>
        <div className="login__card">{children}</div>
      </section>
      <aside className="login__backdrop">
        <div className="login__prism" aria-hidden="true"></div>
        <div className="login__backdrop-copy">
          <h2 className="login__program-title">The Performance Review</h2>
          <p className="login__program-lead">
            A guided career conversation for emids' employees — planned together, signed off step
            by step.
          </p>
        </div>
      </aside>
    </main>
  )
}
