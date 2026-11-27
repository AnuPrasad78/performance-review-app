import { jsPDF } from 'jspdf'

/** A landscape PDF of one table: a title band naming the export and the
    filters behind it, then the rows in a wrapped grid whose header repeats
    on every page. Wide exports (the roster's 14+ columns) move up to A3 so
    cells stay legible instead of shrinking to nothing. */

const MARGIN_MM = 10
const FONT_PT = 7
const LINE_MM = 3.1
const PAD_MM = 1.4
const BAND_MM = 16
const A3_FROM_COLUMNS = 9
/** No column asks for more than this, however long its longest cell. */
const MAX_COLUMN_MM = 55
// Brand teal (--teal #47a2b0) and wash (--teal-wash #eef5f6) as jsPDF RGB.
const TEAL: [number, number, number] = [71, 162, 176]
const WASH: [number, number, number] = [238, 245, 246]

export interface TablePdfHeading {
  title: string
  /** One line naming the filters the rows were drawn under. */
  subtitle: string
}

/** Measured column widths: each column asks for its widest cell (capped),
    but never gets less than its longest header word, so headings wrap
    between words, never through them. Spare room is shared out in
    proportion; a shortfall is taken from what columns asked beyond that
    floor, in proportion too. */
function columnWidths(doc: jsPDF, rows: readonly (readonly string[])[], columnCount: number, available: number): number[] {
  doc.setFontSize(FONT_PT)
  const measure = (text: string, bold: boolean): number => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    return doc.getTextWidth(text)
  }
  const floors: number[] = []
  const asks: number[] = []
  for (let column = 0; column < columnCount; column += 1) {
    const heading = rows[0]?.[column] ?? ''
    const longestWord = Math.max(0, ...heading.split(/\s+/).map((word) => measure(word, true)))
    const widest = Math.max(
      measure(heading, true),
      ...rows.slice(1).map((row) => measure(row[column] ?? '', false)),
    )
    const floor = longestWord + PAD_MM * 2 + 0.5
    floors.push(floor)
    asks.push(Math.max(floor, Math.min(MAX_COLUMN_MM, widest + PAD_MM * 2)))
  }
  const asked = asks.reduce((sum, width) => sum + width, 0)
  if (asked <= available) return asks.map((width) => (width / asked) * available)
  const floorTotal = floors.reduce((sum, width) => sum + width, 0)
  const share = Math.max(0, (available - floorTotal) / (asked - floorTotal))
  return asks.map((width, column) => {
    const floor = floors[column] ?? 0
    return floor + (width - floor) * share
  })
}

export function tablePdfBlob(rows: readonly (readonly string[])[], heading: TablePdfHeading): Blob {
  const header = rows[0] ?? []
  const body = rows.slice(1)
  const columnCount = header.length
  const doc = new jsPDF({
    unit: 'mm',
    orientation: 'landscape',
    format: columnCount >= A3_FROM_COLUMNS ? 'a3' : 'a4',
  })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const widths = columnWidths(doc, rows, columnCount, pageWidth - MARGIN_MM * 2)

  doc.setFillColor(...TEAL)
  doc.rect(0, 0, pageWidth, BAND_MM, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(heading.title, MARGIN_MM, 7.5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  const subtitle = doc.splitTextToSize(heading.subtitle, pageWidth - MARGIN_MM * 2) as string[]
  doc.text(subtitle[0] ?? '', MARGIN_MM, 12.5)
  doc.setTextColor(0, 0, 0)

  let y = BAND_MM + 4

  const cellLines = (row: readonly string[]): string[][] =>
    widths.map((width, column) => doc.splitTextToSize(row[column] ?? '', width - PAD_MM * 2) as string[])

  const drawRow = (row: readonly string[], bold: boolean, fill: [number, number, number] | null): void => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(FONT_PT)
    const lines = cellLines(row)
    const height = Math.max(1, ...lines.map((cell) => cell.length)) * LINE_MM + PAD_MM * 2
    if (y + height > pageHeight - MARGIN_MM) {
      doc.addPage()
      y = MARGIN_MM
      if (!bold) drawRow(header, true, WASH)
      doc.setFont('helvetica', bold ? 'bold' : 'normal')
      doc.setFontSize(FONT_PT)
    }
    if (fill !== null) {
      doc.setFillColor(...fill)
      doc.rect(MARGIN_MM, y, pageWidth - MARGIN_MM * 2, height, 'F')
    }
    let x = MARGIN_MM
    lines.forEach((cell, column) => {
      doc.text(cell, x + PAD_MM, y + PAD_MM + LINE_MM * 0.8)
      x += widths[column] ?? 0
    })
    doc.setDrawColor(219, 219, 215)
    doc.line(MARGIN_MM, y + height, pageWidth - MARGIN_MM, y + height)
    y += height
  }

  drawRow(header, true, WASH)
  if (body.length === 0) {
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(9)
    doc.text('No employees match the applied filters.', MARGIN_MM, y + 6)
  }
  body.forEach((row) => drawRow(row, false, null))

  const pages = doc.getNumberOfPages()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(124, 134, 132)
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page)
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN_MM, pageHeight - 4, { align: 'right' })
  }
  return doc.output('blob')
}
