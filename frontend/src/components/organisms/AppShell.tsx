import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '../atoms/Icon'
import { SessionMenu } from './SessionMenu'
import { useAuth } from '../../state/AuthContext'
import { initialsOf, ROLE_LABELS } from '../../lib/authUsers'
import logoUrl from '../../assets/emids-logo.svg'

export interface NavSection {
  to: string
  label: string
  icon: IconName
}

export interface AppShellProps {
  headerTitle: string
  /** Single-page shells render without the drawer; nav sections opt the shell back in. */
  navSections?: readonly NavSection[]
  children: ReactNode
}

export function AppShell({ headerTitle, navSections, children }: AppShellProps) {
  const hasDrawer = navSections !== undefined && navSections.length > 0
  const [navOpen, setNavOpen] = useState(false)
  const { session } = useAuth()

  return (
    <>
      <header className="header">
        {hasDrawer ? (
          <button
            className="icon-btn"
            aria-label="Open navigation"
            aria-expanded={navOpen}
            onClick={() => setNavOpen(true)}
          >
            <Icon name="menu" size={22} />
          </button>
        ) : null}
        <span className="header__logo">
          <img src={logoUrl} alt="Emids" />
        </span>
        <span className="header__title">{headerTitle}</span>
        {session !== null ? <SessionMenuSlot /> : null}
      </header>
      <main className="content">{children}</main>
      {hasDrawer && navOpen ? (
        <>
          <div
            className="drawer-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={() => setNavOpen(false)}
          />
          <div className="drawer">
            <div className="drawer__topbar" aria-hidden="true"></div>
            <div className="drawer__profile">
              <span className="avatar" aria-hidden="true">
                {session !== null ? initialsOf(session.name) : 'AD'}
              </span>
              <div>
                <div className="drawer__name">{session !== null ? session.name : 'Admin'}</div>
                <div className="drawer__role">
                  {session !== null ? ROLE_LABELS[session.role] : 'Review administration'}
                </div>
              </div>
              <button
                className="icon-btn drawer__close"
                aria-label="Close navigation"
                onClick={() => setNavOpen(false)}
              >
                <Icon name="close" size={20} />
              </button>
            </div>
            <nav className="drawer__nav">
              {navSections.map((section) => (
                <NavLink
                  key={section.to}
                  to={section.to}
                  className={({ isActive }) => `nav-item${isActive ? ' is-active' : ''}`}
                  onClick={() => setNavOpen(false)}
                >
                  <Icon name={section.icon} />
                  <span className="nav-item__label">{section.label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </>
  )
}

/** Reuses the shared session popover, positioned to fit the slim header. */
function SessionMenuSlot() {
  return (
    <div className="header__session-slot">
      <SessionMenu />
    </div>
  )
}
