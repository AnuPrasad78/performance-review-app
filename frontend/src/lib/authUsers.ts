/** Sign-in over the backend's stub-identity endpoint (backend routers/auth.py).
    The form keeps its password field untouched so the SSO hand-off later is
    invisible, but nothing here verifies a password: confidently claiming who
    you are against the roster is exactly the seam this release ships. The
    IdP, not this app, owns secrets. */

import { fetchSession } from './api'

export type AuthRole = 'admin' | 'employee'

export interface LoginAccount {
  email: string
  name: string
  role: AuthRole
}

export type AuthResult = { ok: true; account: LoginAccount } | { ok: false; error: string }

export async function authenticate(email: string): Promise<AuthResult> {
  if (email.trim() === '') {
    return { ok: false, error: 'Enter your email and password to sign in.' }
  }
  const result = await fetchSession(email.trim().toLowerCase())
  if (!result.ok) {
    const message =
      result.code === 'network_error'
        ? 'Could not reach the review API. Check that the backend is running.'
        : result.detail
    return { ok: false, error: message }
  }
  return {
    ok: true,
    account: {
      email: result.session.email,
      name: result.session.name,
      role: result.session.role,
    },
  }
}

/** Monogram for avatar tiles — first two word initials, uppercase. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/)
  return (words[0] ?? '').charAt(0).concat((words[1] ?? '').charAt(0)).toUpperCase()
}
