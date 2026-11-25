import { useEffect, useState } from 'react'
import { Button } from '../atoms/Button'
import { Select, type SelectOption } from '../atoms/Select'
import { SearchBar } from './SearchBar'

export interface TableFilterSpec {
  /** The query word a change routes on — the same camelCase word the wire
      carries (e.g. `org`); the label is the visible noun. */
  key: string
  label: string
  /** Dropdown options; a blank-value option means "any" and must be present
      so the pop-up can return to unfiltered. */
  options: readonly SelectOption[]
  value: string
}

export interface TableQueryControlsProps {
  search: string
  onSearchChange: (term: string) => void
  filters: readonly TableFilterSpec[]
  onFilterChange: (key: string, value: string) => void
  sortFields: readonly SelectOption[]
  sortField: string
  sortOrder: 'asc' | 'desc'
  onSortFieldChange: (field: string) => void
  onSortOrderChange: (order: 'asc' | 'desc') => void
  /** Blank-renders every control at once (search, filters, sort). */
  onClear: () => void
}

const SORT_ORDER_OPTIONS: readonly SelectOption[] = [
  { value: 'asc', label: 'Ascending' },
  { value: 'desc', label: 'Descending' },
]

/** Both admin tables' compact query controls: one trigger at the table's
    top-right opening a pop-up where search, filters and sort live together.
    Popover pattern of SessionMenu — backdrop click-away, Escape, no portal;
    changes apply live, so there is no Apply button. */
export function TableQueryControls({
  search,
  onSearchChange,
  filters,
  onFilterChange,
  sortFields,
  sortField,
  sortOrder,
  onSortFieldChange,
  onSortOrderChange,
  onClear,
}: TableQueryControlsProps) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <span className="table-query-anchor">
      <button
        type="button"
        className="table-query-trigger mono"
        aria-label="Search, filter and sort"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        SEARCH &amp; FILTER
      </button>
      {open ? (
        <>
          <div
            className="popover-backdrop"
            role="presentation"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="table-query-popover" role="dialog" aria-label="Search, filter and sort">
            <div className="table-query-popover__section">
              <span className="table-query-popover__heading mono">Search</span>
              <SearchBar
                value={search}
                onChange={onSearchChange}
                placeholder="Name or designation"
                ariaLabel="Search by employee name or designation"
              />
            </div>
            <div className="table-query-popover__section">
              <span className="table-query-popover__heading mono">Filters</span>
              {filters.map((filter) => (
                <label className="table-query-popover__row" key={filter.key}>
                  <span className="table-query-popover__field-label mono">{filter.label}</span>
                  <Select
                    value={filter.value}
                    options={filter.options}
                    ariaLabel={`Filter by ${filter.label}`}
                    onChange={(value) => onFilterChange(filter.key, value)}
                  />
                </label>
              ))}
            </div>
            <div className="table-query-popover__section">
              <span className="table-query-popover__heading mono">Sort</span>
              <label className="table-query-popover__row">
                <span className="table-query-popover__field-label mono">Sort by</span>
                <Select
                  value={sortField}
                  options={sortFields}
                  ariaLabel="Sort by"
                  onChange={onSortFieldChange}
                />
              </label>
              <label className="table-query-popover__row">
                <span className="table-query-popover__field-label mono">Direction</span>
                <Select
                  value={sortOrder}
                  options={SORT_ORDER_OPTIONS}
                  ariaLabel="Sort direction"
                  onChange={(value) => onSortOrderChange(value as 'asc' | 'desc')}
                />
              </label>
            </div>
            <div className="table-query-popover__actions">
              <Button variant="ghost" size="sm" onClick={onClear}>
                Clear all
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </span>
  )
}
