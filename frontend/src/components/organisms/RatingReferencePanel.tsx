import { Card } from '../atoms/Card'
import { DataTable, type DataTableColumn } from '../molecules/DataTable'
import { RATING_SCALE_REFERENCE } from '../../lib/selfEvaluationContent'
import type { RatingScaleEntry } from '../../lib/types'

const columns: readonly DataTableColumn<RatingScaleEntry>[] = [
  {
    key: 'value',
    header: 'Value',
    cell: (entry) => <span className="mono nowrap">{entry.value}</span>,
  },
  { key: 'name', header: 'Expectation', cell: (entry) => entry.name },
  { key: 'description', header: 'Description', cell: (entry) => entry.description },
]

export function RatingReferencePanel() {
  return (
    <Card>
      <DataTable
        columns={columns}
        rows={RATING_SCALE_REFERENCE}
        rowKey={(entry) => `rating-${entry.value}`}
        emptyMessage="No rating definitions loaded."
      />
      <p className="rating-reference__note muted">
        The self-rating is a discussion input, not a verdict. The manager chooses the overall
        rating after reading the responses and the review conversation, and can point to
        specific work when doing so.
      </p>
    </Card>
  )
}
