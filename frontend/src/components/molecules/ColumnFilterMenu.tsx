import { useEffect, useRef, useState } from 'react'
import { Icon } from '../atoms/Icon'
import type { SelectOption } from '../atoms/Select'

export interface FilterMenuControl {
  /** The word in force — '' means the column is unfiltered. */
  value: string
  /** Whole-roster value list whose first entry ('' / 'Any') un-filters. */
  options: readonly SelectOption[]
  onChange: (value: string) => void
}

export interface ColumnFilterMenuProps {
  /** The column noun for the trigger's aria-label and the panel heading. */
  label: string
  control: FilterMenuControl
}

/** Panel placement: fixed coordinates under the trigger. When the trigger
    sits near the viewport's right edge the panel flips and its right edge
    meets the trigger's — it can never widen the page. */
type PanelPlacement = { top: number; left: number } | { top: number; right: number }

/** One table column's filter affordance: a funnel trigger beside the header
    text opening a choose-on-click list of this column's whole-roster values.
    Popover pattern of TableQueryControls — backdrop click-away and Escape,
    changes apply live, so there is no Apply button. The panel is fixed so it
    escapes a scroll-clipped table without a portal, and it folds when the
    page or its table scrolls away beneath it. */
export function ColumnFilterMenu({ label, control }: ColumnFilterMenuProps) {
  const [open, setOpen] = useState(false)
  const [placement, setPlacement] = useState<PanelPlacement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const active = control.value !== ''

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  useEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    const place = (): void => {
      const trigger = triggerRef.current
      if (trigger === null) return
      const rect = trigger.getBoundingClientRect()
      // A next panel would hang past the right edge for a column the table
      // truncated toward it — flip so its right edge anchors instead.
      if (rect.left + 240 > window.innerWidth) {
        setPlacement({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) })
      } else {
        setPlacement({ top: rect.bottom + 8, left: rect.left })
      }
    }
    // The panel stays put while anything scrolls — a fixed overlay must
    // never fold on the user's own scrolling of the page or the list.
    place()
  }, [open])

  const style: React.CSSProperties | undefined =
    placement === null
      ? undefined
      : 'left' in placement
        ? { top: placement.top, left: placement.left }
        : { top: placement.top, right: placement.right }

  return (
    <span className="table-filter-anchor">
      <button
        ref={triggerRef}
        type="button"
        className={active ? 'table-filter-trigger table-filter-trigger--active' : 'table-filter-trigger'}
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="funnel" size={12} />
      </button>
      {open && placement !== null ? (
        <>
          <div
            className="popover-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div
            className={
              'right' in placement
                ? 'table-filter-popover table-filter-popover--flip'
                : 'table-filter-popover'
            }
            style={style}
            role="dialog"
            aria-label={`Filter by ${label}`}
          >
            <span className="table-filter-popover__heading mono">Filter · {label}</span>
            <ul className="table-filter-popover__list">
              {control.options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    className={
                      option.value === control.value
                        ? 'table-filter-popover__option table-filter-popover__option--chosen'
                        : 'table-filter-popover__option'
                    }
                    onClick={() => {
                      control.onChange(option.value)
                      setOpen(false)
                    }}
                  >
                    {option.label}
                    {option.value === control.value ? <Icon name="check" size={12} /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </span>
  )
}
