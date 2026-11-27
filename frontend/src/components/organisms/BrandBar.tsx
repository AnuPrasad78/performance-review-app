import { SessionMenu } from './SessionMenu'
import logoUrl from '../../assets/emids-logo.svg'
import { useSessionProfile } from '../../state/SessionProfileContext'

export interface BrandBarProps {
  /** Section label shown beside the logo. */
  label: string
}

/** Sticky top bar: brand lockup on the left, the session chip on the right,
    so the signed-in identity stays reachable however far the page scrolls.
    The roster row arrives through the session-profile bridge, published by
    whichever page below loaded it. */
export function BrandBar({ label }: BrandBarProps) {
  const { profile } = useSessionProfile()
  return (
    <header className="brand-bar">
      <div className="brand-bar__brand">
        <img className="brand-bar__logo" src={logoUrl} alt="Emids" />
        <span className="brand-bar__divider" aria-hidden="true" />
        <span className="brand-bar__label">{label}</span>
      </div>
      <div className="brand-bar__session">
        <SessionMenu profile={profile} />
      </div>
    </header>
  )
}
