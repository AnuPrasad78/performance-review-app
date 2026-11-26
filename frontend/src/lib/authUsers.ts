/** Sign-in over the backend's email/password form endpoint (backend
    routers/auth.py). The backend owns the password rule: where a provision
    password is configured it must match (and a session cookie is issued);
    developer machines without one trust the address alone. Nothing here
    inspects the password beyond passing it along. */

import { fetchSession } from './api'

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
}

export type AuthResult = { ok: true; account: LoginAccount } | { ok: false; error: string }

export async function authenticate(email: string, password: string): Promise<AuthResult> {
  if (email.trim() === '') {
    return { ok: false, error: 'Enter your email and password to sign in.' }
  }
  const result = await fetchSession(email.trim().toLowerCase(), password)
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

/** Per-account employee details for the session popover, keyed by the
    sign-in email; the admin account has no employee record. Shapes mirror the
    roster wire (the full Employee contract) until the session endpoint
    carries the profile itself. */
const SESSION_PROFILES: Readonly<Record<string, SelfEvaluationEmployee>> = {
  'asha_menon@emids.com': {
    employeeId: 'EMP-1001',
    name: 'Asha Menon',
    email: 'asha_menon@emids.com',
    designation: 'Engineer',
    location: 'Bengaluru',
    org: 'Quality',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Joseph Mathew',
    businessPartner: 'John D',
    reportingManager: 'Ravi Menon',
    status: 'Active',
  },
  'bilal_khan@emids.com': {
    employeeId: 'EMP-1002',
    name: 'Bilal Khan',
    email: 'bilal_khan@emids.com',
    designation: 'Senior Engineer',
    location: 'Bengaluru',
    org: 'Delivery',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Joseph Mathew',
    businessPartner: 'John D',
    reportingManager: 'Ravi Menon',
    status: 'Active',
  },
  'cara_fernandes@emids.com': {
    employeeId: 'EMP-1003',
    name: 'Cara Fernandes',
    email: 'cara_fernandes@emids.com',
    designation: 'Business Analyst',
    location: 'Chennai',
    org: 'Analytics',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Anika Rao',
    businessPartner: 'John D',
    reportingManager: 'Anika Rao',
    status: 'Active',
  },
  'devika_nair@emids.com': {
    employeeId: 'EMP-1004',
    name: 'Devika Nair',
    email: 'devika_nair@emids.com',
    designation: 'Engineer',
    location: 'Pune',
    org: 'Quality',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Anika Rao',
    businessPartner: 'John D',
    reportingManager: 'Anika Rao',
    status: 'Active',
  },
  'eshan_gupta@emids.com': {
    employeeId: 'EMP-1005',
    name: 'Eshan Gupta',
    email: 'eshan_gupta@emids.com',
    designation: 'Team Lead',
    location: 'Bengaluru',
    org: 'Delivery',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Joseph Mathew',
    businessPartner: 'John D',
    reportingManager: 'Joseph Mathew',
    status: 'Active',
  },
  'farah_sheikh@emids.com': {
    employeeId: 'EMP-1006',
    name: 'Farah Sheikh',
    email: 'farah_sheikh@emids.com',
    designation: 'Analyst',
    location: 'Chennai',
    org: 'Analytics',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Anika Rao',
    businessPartner: 'John D',
    reportingManager: 'Anika Rao',
    status: 'Active',
  },
  'heena_roy@emids.com': {
    employeeId: 'EMP-1007',
    name: 'Heena Roy',
    email: 'heena_roy@emids.com',
    designation: 'Engineer',
    location: 'Pune',
    org: 'Quality',
    businessUnit: 'Delivery',
    project: 'Cigna One',
    deliveryHead: 'Divya Prakash',
    deliveryManager: 'Joseph Mathew',
    businessPartner: 'John D',
    reportingManager: 'Joseph Mathew',
    status: 'Active',
  },
}

export function sessionProfileFor(email: string): SelfEvaluationEmployee | null {
  return SESSION_PROFILES[email] ?? null
}
