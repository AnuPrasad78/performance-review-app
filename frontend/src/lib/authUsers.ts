/** Directory of portal sign-in accounts, sourced from the 2026 roster CSV plus
    the standing admin credential. Mock layer — the backend owns real credentials. */

export type AuthRole = 'admin' | 'employee'

export interface LoginAccount {
  email: string
  name: string
  role: AuthRole
  /** Inactive accounts exist on the portal but cannot sign in. */
  active: boolean
}

/** One shared portal password until the backend introduces per-user hashing. */
export const PORTAL_PASSWORD = 'Portal@2026'

export const LOGIN_DIRECTORY: readonly LoginAccount[] = [
  { email: 'admin@emids.com', name: 'Review Administrator', role: 'admin', active: true },
  { email: 'asha_menon@emids.com', name: 'Asha Menon', role: 'employee', active: true },
  { email: 'bilal_khan@emids.com', name: 'Bilal Khan', role: 'employee', active: true },
  { email: 'cara_fernandes@emids.com', name: 'Cara Fernandes', role: 'employee', active: true },
  { email: 'devika_nair@emids.com', name: 'Devika Nair', role: 'employee', active: true },
  { email: 'eshan_gupta@emids.com', name: 'Eshan Gupta', role: 'employee', active: true },
  { email: 'farah_sheikh@emids.com', name: 'Farah Sheikh', role: 'employee', active: true },
  { email: 'gaurav_bhatt@emids.com', name: 'Gaurav Bhatt', role: 'employee', active: false },
  { email: 'heena_roy@emids.com', name: 'Heena Roy', role: 'employee', active: true },
]

export type AuthResult = { ok: true; account: LoginAccount } | { ok: false; error: string }

export function authenticate(email: string, password: string): AuthResult {
  const candidate = email.trim().toLowerCase()
  if (candidate === '' || password === '') {
    return { ok: false, error: 'Enter your email and password to sign in.' }
  }
  const account = LOGIN_DIRECTORY.find((entry) => entry.email === candidate)
  if (account === undefined) {
    return { ok: false, error: 'This email is not on the portal roster.' }
  }
  if (!account.active) {
    return {
      ok: false,
      error: 'This account is inactive. Contact your business partner for help.',
    }
  }
  if (password !== PORTAL_PASSWORD) {
    return { ok: false, error: 'Incorrect password. Try again or reset with your business partner.' }
  }
  return { ok: true, account }
}

/** Monogram for avatar tiles — first two word initials, uppercase. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/)
  return (words[0] ?? '').charAt(0).concat((words[1] ?? '').charAt(0)).toUpperCase()
}
