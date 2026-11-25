import type { KeyboardEvent, ReactNode } from 'react'

export interface DataTableColumn<Row> {
  key: string
  header: string
  cell: (row: Row) => ReactNode
  /** Secondary columns drop out in phone view so the table stays readable. */
  hideOnMobile?: boolean
}

export interface DataTableProps<Row> {
  columns: readonly DataTableColumn<Row>[]
  rows: readonly Row[]
  rowKey: (row: Row) => string
  emptyMessage: string
  /** Reveals this table's row content elsewhere; rows stay keyboard-reachable. */
  onRowClick?: (row: Row) => void
  activeRowKey?: string | null
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyMessage,
  onRowClick,
  activeRowKey = null,
}: DataTableProps<Row>) {
  const selectable = onRowClick !== undefined

  const activate = (event: KeyboardEvent<HTMLTableRowElement>, row: Row) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onRowClick?.(row)
    }
  }

  return (
    <table className="table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" className={column.hideOnMobile ? 'col-desktop' : undefined}>
              {column.header}
            </th>
          ))}
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
                  <td key={column.key} className={column.hideOnMobile ? 'col-desktop' : undefined}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })
        )}
      </tbody>
    </table>
  )
}
