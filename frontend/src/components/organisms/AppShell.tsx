import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from '../atoms/Icon'
import logoUrl from '../../assets/emids-logo.svg'

export interface NavSection {
  to: string
  label: string
  icon: IconName
}

export interface AppShellProps {
  headerTitle: string
  navSections: readonly NavSection[]
  children: ReactNode
}

export function AppShell({ headerTitle, navSections, children }: AppShellProps) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <>
      <header className="header">
        <button
          className="icon-btn"
          aria-label="Open navigation"
          aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}
        >
          <Icon name="menu" size={22} />
        </button>
        <span className="header__logo">
          <img src={logoUrl} alt="Emids" />
        </span>
        <span className="header__title">{headerTitle}</span>
      </header>
      <main className="content">{children}</main>
      {navOpen ? (
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
                AD
              </span>
              <div>
                <div className="drawer__name">Admin</div>
                <div className="drawer__role">Review administration</div>
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
