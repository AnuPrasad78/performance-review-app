import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Button } from '../components/atoms/Button'
import { Icon } from '../components/atoms/Icon'
import { Input } from '../components/atoms/Input'
import { LoginTemplate } from '../components/templates/LoginTemplate'
import { useAuth } from '../state/AuthContext'
import type { AuthRole } from '../lib/authUsers'
import type { AuthResult } from '../lib/authUsers'

export const ROLE_HOME: Record<AuthRole, string> = {
  admin: '/users',
  employee: '/dashboard',
}

function guardedFrom(locationState: unknown): string | null {
  if (typeof locationState !== 'object' || locationState === null || !('from' in locationState)) {
    return null
  }
  const from = (locationState as { from: unknown }).from
  if (typeof from !== 'object' || from === null) return null
  const pathname = (from as { pathname?: unknown }).pathname
  if (typeof pathname !== 'string' || !pathname.startsWith('/')) return null
  return pathname
}

export function LoginPage() {
  const { session, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    setError(null)
    setBusy(true)
    void signIn(email, password).then((result: AuthResult) => {
      if (!result.ok) {
        setBusy(false)
        setError(result.error)
        return
      }
      const from = guardedFrom(location.state)
      navigate(from ?? ROLE_HOME[result.account.role], { replace: true })
    })
  }

  if (session !== null) {
    return <Navigate to={guardedFrom(location.state) ?? ROLE_HOME[session.role]} replace />
  }

  return (
    <LoginTemplate>
      <div className="login__form-stack">
        <h1 className="login__title">Sign in</h1>
        <p className="login__lead">Access your performance review workspace.</p>

        <button type="button" className="login__ms-btn" disabled>
          <MicrosoftLogo />
          Sign in with Microsoft
        </button>
        <p className="muted login__hint">SSO unavailable in this release</p>

        <div className="login__divider" role="separator">
          <span>or sign in with email</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Email
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              placeholder="name_lastname@emids.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </div>
          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Password
            </label>
            <div className="pw-control">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="pw-control__toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                disabled={busy}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
          </div>

          {error !== null ? <AlertBanner message={error} /> : null}

          <Button type="submit" busy={busy} disabled={busy} className="login__submit">
            Sign in
          </Button>
        </form>
      </div>
    </LoginTemplate>
  )
}

function MicrosoftLogo(): ReactNode {
  return (
    <svg viewBox="0 0 21 21" width="16" height="16" aria-hidden="true">
      <rect width="9" height="9" fill="#f25022" />
      <rect x="11" width="9" height="9" fill="#7fba00" />
      <rect y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}

function AlertBanner({ message }: { message: string }): ReactNode {
  return (
    <div className="login__alert" role="alert">
      <span className="login__alert-dot" aria-hidden="true"></span>
      {message}
    </div>
  )
}
