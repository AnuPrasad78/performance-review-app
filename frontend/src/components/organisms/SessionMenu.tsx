import { useState } from 'react'
import { Button } from '../atoms/Button'
import { Icon } from '../atoms/Icon'
import { useAuth } from '../../state/AuthContext'
import { initialsOf, sessionProfileFor, ROLE_LABELS } from '../../lib/authUsers'
import type { Employee } from '../../lib/types'

export interface SessionMenuProps {
  /** The signed-in employee's roster row, when the enclosing page has one
      (e.g. the employee dashboard's API record). Absent elsewhere: the menu
      then falls back to the mock session-profile lookup. */
  profile?: Employee | null
}

export function SessionMenu({ profile: profileProp }: SessionMenuProps) {
  const [open, setOpen] = useState(false)
  const { session, signOut } = useAuth()
  if (session === null) return null

  const profile = profileProp ?? sessionProfileFor(session.email)
  const employeeId = profile?.employeeId ?? ROLE_LABELS[session.role]
  const popoverFields =
    profile === null
      ? []
      : [
          { key: 'name', label: 'Name', value: profile.name },
          { key: 'id', label: 'Employee ID', value: profile.employeeId },
          { key: 'role', label: 'Position', value: profile.designation },
          { key: 'dept', label: 'Department', value: profile.org },
          { key: 'loc', label: 'Location', value: profile.location },
          { key: 'mgr', label: 'Reporting manager', value: profile.reportingManager },
          { key: 'dm', label: 'DM', value: profile.deliveryManager },
          { key: 'dh', label: 'DH/DP', value: profile.deliveryHead },
        ]

  function handleSignOut(): void {
    setOpen(false)
    signOut()
  }

  return (
    <>
      <button
        type="button"
        className="header__session session-chip"
        aria-label="Session details"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="avatar avatar--profile-icon" aria-hidden="true">
          <Icon name="user" size={22} />
        </span>
        <span className="session-chip__text">
          <span className="session-chip__name">{session.name}</span>
          <span className="session-chip__id mono">{employeeId}</span>
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (
        <>
          <div
            className="popover-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="session-popover" role="dialog" aria-label="Session details">
            <div className="session-popover__identity">
              <span className="avatar avatar--lg" aria-hidden="true">
                {initialsOf(session.name)}
              </span>
              <div>
                <div className="session-popover__name">{session.name}</div>
                <div className="session-popover__role">{ROLE_LABELS[session.role]}</div>
                <div className="session-popover__email muted">{session.email}</div>
              </div>
            </div>
            {popoverFields.length > 0 ? (
              <dl className="session-popover__grid">
                {popoverFields.map((field) => (
                  <div key={field.key} className="session-popover__cell">
                    <dt className="session-popover__label mono">{field.label}</dt>
                    <dd className="session-popover__value">{field.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            <div className="session-popover__actions">
              <Button variant="ghost" size="sm" className="btn--logout" onClick={handleSignOut}>
                Sign out
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </>
  )
}
