import type { KeyboardEvent, ReactNode } from 'react'
import { Icon } from '../atoms/Icon'

export interface DataTableSort {
  /** The wire word the read currently sorts by and its direction. */
  sortBy: string
  sortOrder: 'asc' | 'desc'
  /** A sortable header click sends its column's sortKey; the owner decides
      the next room (asc -> desc for the same key, asc for a new one). */
  onChange: (sortKey: string) => void
}

export interface DataTableColumn<Row> {
  key: string
  header: string
  cell: (row: Row) => ReactNode
  /** Secondary columns drop out in phone view so the table stays readable. */
  hideOnMobile?: boolean
  /** The wire sort word this header toggles; the column is sortable only
      while the table carries a `sort` prop. */
  sortKey?: string
  /** Pins the column to the table's left edge while the rest scroll
      sideways under it — for the leading identity column only. */
  sticky?: boolean
}

function cellClass<Row>(column: DataTableColumn<Row>): string | undefined {
  const classes = [column.hideOnMobile ? 'col-desktop' : '', column.sticky ? 'table__cell--sticky' : '']
    .filter(Boolean)
    .join(' ')
  return classes === '' ? undefined : classes
}

export interface DataTableProps<Row> {
  columns: readonly DataTableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  emptyMessage: string
  /** Reveals this table's row content elsewhere; rows stay keyboard-reachable. */
  onRowClick?: (row: Row) => void
  activeRowKey?: string | null
  /** Header sort state; omitted means every header stays plain text. */
  sort?: DataTableSort
  /** One node per column key rendered beside the header text — a column
      filter menu lives here when a table needs one. */
  headerAdornments?: Readonly<Record<string, ReactNode>>
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  onRowClick,
  activeRowKey = null,
  sort,
  headerAdornments,
}: DataTableProps<Row>) {
  const selectable = onRowClick !== undefined

  const activate = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick?.(row)
    }
  }

  return (
    <div className="table-scroll">
      <table className="table">
        <thead>
          <tr>
            {columns.map((column) => {
            const sortable = sort !== undefined && column.sortKey !== undefined
            const active = sortable && sort.sortBy === column.sortKey
            const adornment = headerAdornments?.[column.key]
            return (
              <th
                key={column.key}
                scope="col"
                className={cellClass(column)}
                aria-sort={active ? (sort.sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
              >
                {sortable ? (
                  <button
                    type="button"
                    className="table__sort"
                    aria-label={`Sort by ${column.header}`}
                    onClick={() => sort.onChange(column.sortKey as string)}
                  >
                    {column.header}
                    {active ? (
                      <Icon name={sort.sortOrder === 'asc' ? 'chevron-up' : 'chevron-down'} size={11} />
                    ) : null}
                  </button>
                ) : (
                  column.header
                )}
                {adornment ?? null}
              </th>
            )
          })}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="table__empty">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const key = rowKey(row)
            const classes = [
              selectable ? 'table__row--selectable' : '',
              key === activeRowKey ? 'table__row--active' : '',
            ]
              .filter(Boolean)
              .join(' ')
            return (
              <tr
                key={key}
                className={classes === '' ? undefined : classes}
                tabIndex={selectable ? 0 : undefined}
                onClick={selectable ? () => onRowClick?.(row) : undefined}
                onKeyDown={selectable ? (event) => activate(event, row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={cellClass(column)}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })
        )}
      </tbody>
      </table>
    </div>
  )
}
