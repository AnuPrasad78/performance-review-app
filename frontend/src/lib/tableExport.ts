import { saveCsvBlob } from './csvDownload'
import { parseCsv } from './csvParse'
import { exportFileName } from './exportFileName'
import { filterSummary, type AppliedFilter } from './exportFilters'
import { tablePdfBlob } from './tablePdf'
import { xlsxBlob } from './xlsxBuild'

/** The admin tables' multi-format export. The server's CSV stays the single
    source of the rows (it applies every search, filter and sort to the whole
    matched set); Excel and PDF are re-shapings of that same CSV in the
    browser, so the three formats always carry identical data. */

export type ExportFormat = 'csv' | 'xlsx' | 'pdf'

export const EXPORT_FORMATS: readonly { format: ExportFormat; label: string }[] = [
  { format: 'csv', label: 'CSV (.csv)' },
  { format: 'xlsx', label: 'Excel (.xlsx)' },
  { format: 'pdf', label: 'PDF (.pdf)' },
]

const EXTENSIONS: Record<ExportFormat, string> = { csv: 'csv', xlsx: 'xlsx', pdf: 'pdf' }

export interface TableExportSpec {
  /** File-name stem, e.g. "review-status". */
  base: string
  /** Human title for the sheet name and the PDF heading. */
  title: string
  filters: readonly AppliedFilter[]
}

export async function saveTableExport(
  csv: Blob,
  format: ExportFormat,
  spec: TableExportSpec,
  now: Date = new Date(),
): Promise<void> {
  const filename = exportFileName(spec.base, spec.filters, EXTENSIONS[format], now)
  if (format === 'csv') {
    saveCsvBlob(csv, filename)
    return
  }
  const rows = parseCsv(await csv.text())
  const blob =
    format === 'xlsx'
      ? xlsxBlob(rows, spec.title)
      : tablePdfBlob(rows, {
          title: spec.title,
          subtitle: `${filterSummary(spec.filters)} · Generated ${now.toLocaleString()}`,
        })
  saveCsvBlob(blob, filename)
}
