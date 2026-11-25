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
  admin: '/review-status',
  employee: '/dashboard',
}

const SSO_NOT_WIRED = 'SSO is not enabled for this release — sign in with your email.'
const RESET_NOT_WIRED =
  'Password reset is not available in this release — contact an administrator.'

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
        <h1 className="login__heading">Welcome</h1>
        <p className="login__lead">Sign in to your performance review account.</p>

        <button type="button" className="login__sso-btn" onClick={() => setError(SSO_NOT_WIRED)}>
          <MicrosoftLogo />
          Sign in with Emids SSO
        </button>

        <div className="login__divider" role="separator">
          <span>or sign in with your email</span>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label className="field__label" htmlFor="login-email">
              Company Email
            </label>
            <div className="icon-control">
              <span className="icon-control__lead" aria-hidden="true">
                <Icon name="mail" size={16} />
              </span>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                placeholder="firstname.lastname@emids.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <div className="field">
            <label className="field__label" htmlFor="login-password">
              Password
            </label>
            <div className="icon-control icon-control--pw">
              <span className="icon-control__lead" aria-hidden="true">
                <Icon name="lock" size={16} />
              </span>
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
                className="icon-control__toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((current) => !current)}
                disabled={busy}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
              </button>
            </div>
            <div className="login__forgot-row">
              <button
                type="button"
                className="login__forgot"
                onClick={() => setError(RESET_NOT_WIRED)}
              >
                Forgot password?
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
