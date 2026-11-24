/** Directory of portal sign-in accounts, sourced from the 2026 roster CSV plus
    the standing admin credential. Mock layer — the backend owns real credentials. */

import type { SelfEvaluationEmployee } from './types'

export type AuthRole = 'admin' | 'employee'

export const ROLE_LABELS: Record<AuthRole, string> = {
  admin: 'Review administration',
  employee: 'Employee',
}

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

/** Per-account employee details for the session popover. Mock data keyed by the
    sign-in email; the admin account has no employee record. The backend seam will
    supply the real profile with the session. */
const SESSION_PROFILES: Readonly<Record<string, SelfEvaluationEmployee>> = {
  'asha_menon@emids.com': {
    firstName: 'Asha',
    lastName: 'Menon',
    email: 'asha_menon@emids.com',
    role: 'Engineer',
    department: 'Quality',
    manager: 'Ravi Menon',
    employeeId: 'EMP-1001',
    location: 'Bengaluru',
    deliveryManager: 'Joseph Mathew',
    deliveryHead: 'Divya Prakash',
  },
  'bilal_khan@emids.com': {
    firstName: 'Bilal',
    lastName: 'Khan',
    email: 'bilal_khan@emids.com',
    role: 'Senior Engineer',
    department: 'Delivery',
    manager: 'Ravi Menon',
    employeeId: 'EMP-1002',
    location: 'Bengaluru',
    deliveryManager: 'Joseph Mathew',
    deliveryHead: 'Divya Prakash',
  },
  'cara_fernandes@emids.com': {
    firstName: 'Cara',
    lastName: 'Fernandes',
    email: 'cara_fernandes@emids.com',
    role: 'Business Analyst',
    department: 'Analytics',
    manager: 'Anika Rao',
    employeeId: 'EMP-1003',
    location: 'Chennai',
    deliveryManager: 'Anika Rao',
    deliveryHead: 'Divya Prakash',
  },
  'devika_nair@emids.com': {
    firstName: 'Devika',
    lastName: 'Nair',
    email: 'devika_nair@emids.com',
    role: 'Engineer',
    department: 'Quality',
    manager: 'Anika Rao',
    employeeId: 'EMP-1004',
    location: 'Pune',
    deliveryManager: 'Anika Rao',
    deliveryHead: 'Divya Prakash',
  },
  'eshan_gupta@emids.com': {
    firstName: 'Eshan',
    lastName: 'Gupta',
    email: 'eshan_gupta@emids.com',
    role: 'Team Lead',
    department: 'Delivery',
    manager: 'Joseph Mathew',
    employeeId: 'EMP-1005',
    location: 'Bengaluru',
    deliveryManager: 'Joseph Mathew',
    deliveryHead: 'Divya Prakash',
  },
  'farah_sheikh@emids.com': {
    firstName: 'Farah',
    lastName: 'Sheikh',
    email: 'farah_sheikh@emids.com',
    role: 'Analyst',
    department: 'Analytics',
    manager: 'Anika Rao',
    employeeId: 'EMP-1006',
    location: 'Chennai',
    deliveryManager: 'Anika Rao',
    deliveryHead: 'Divya Prakash',
  },
  'heena_roy@emids.com': {
    firstName: 'Heena',
    lastName: 'Roy',
    email: 'heena_roy@emids.com',
    role: 'Engineer',
    department: 'Quality',
    manager: 'Joseph Mathew',
    employeeId: 'EMP-1007',
    location: 'Pune',
    deliveryManager: 'Joseph Mathew',
    deliveryHead: 'Divya Prakash',
  },
}

export function sessionProfileFor(email: string): SelfEvaluationEmployee | null {
  return SESSION_PROFILES[email] ?? null
}
