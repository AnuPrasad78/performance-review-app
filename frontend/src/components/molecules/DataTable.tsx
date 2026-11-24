import type { ReactNode } from 'react'

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
}

export function DataTable<Row>({ columns, rows, rowKey, emptyMessage }: DataTableProps<Row>) {
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
          rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td key={column.key} className={column.hideOnMobile ? 'col-desktop' : undefined}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  )
}
