export interface TableSkeletonColumn {
  /** Relative weight of the band; longer text columns weigh more. */
  weight: number
  /** True when the real column carries `hideOnMobile` — the band collapses
      on phones with the same media cut. */
  desktopOnly?: boolean
}

export interface TableSkeletonProps {
  columns: readonly TableSkeletonColumn[]
  rows?: number
}

/** A skeleton stand-in for the admin tables: one shimmering band per
    column per row, under a slimmer header band that mirrors the weights.
    Bands collapse on phones exactly where the real columns do. */
export function TableSkeleton({ columns, rows = 7 }: TableSkeletonProps) {
  const rowBands = Array.from({ length: rows })

  return (
    <div className="table-skeleton" aria-hidden="true">
      <div className="skeleton-row table-skeleton__head">
        {columns.map((column, index) => (
          <span
            key={index}
            className={column.desktopOnly ? 'skeleton skeleton--cell col-desktop' : 'skeleton skeleton--cell'}
            style={{ flexGrow: column.weight, flexBasis: 0, height: '9px' }}
          />
        ))}
      </div>
      {rowBands.map((_, row) => (
        <div className="skeleton-row" key={row}>
          {columns.map((column, index) => (
            <span
              key={index}
              className={column.desktopOnly ? 'skeleton skeleton--cell col-desktop' : 'skeleton skeleton--cell'}
              style={{ flexGrow: column.weight, flexBasis: 0 }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
