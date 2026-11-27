import { strToU8, zipSync } from 'fflate'

/** A minimal Office Open XML workbook (one sheet) built from plain rows:
    every cell is an inline string — never a formula, so a value starting
    with "=" cannot execute — the first row is bold and frozen, and columns
    are sized to their content. fflate (already shipped for the review ZIP)
    does the packaging, so no spreadsheet library is needed. */

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const MAX_COLUMN_WIDTH = 60

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function escapeXml(value: string): string {
  return value
    // Control characters other than tab/newline are illegal in XML 1.0.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Zero-based column index to its spreadsheet letters: 0 → A, 26 → AA. */
export function columnLetters(index: number): string {
  let letters = ''
  let remaining = index + 1
  while (remaining > 0) {
    const offset = (remaining - 1) % 26
    letters = String.fromCharCode(65 + offset) + letters
    remaining = Math.floor((remaining - 1) / 26)
  }
  return letters
}

/** Excel refuses sheet names over 31 characters or carrying []:*?/\ . */
function sheetName(title: string): string {
  const cleaned = title.replace(/[[\]:*?/\\]/g, ' ').trim()
  return (cleaned === '' ? 'Sheet1' : cleaned).slice(0, 31)
}

function sheetXml(rows: readonly (readonly string[])[]): string {
  const columnCount = rows.reduce((widest, row) => Math.max(widest, row.length), 0)
  const widths = Array.from({ length: columnCount }, (_, column) =>
    Math.min(
      MAX_COLUMN_WIDTH,
      rows.reduce((widest, row) => Math.max(widest, (row[column] ?? '').length), 8) + 2,
    ),
  )
  const cols = widths
    .map((width, column) => `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`)
    .join('')
  const body = rows
    .map((row, rowIndex) => {
      const style = rowIndex === 0 ? ' s="1"' : ''
      const cells = row
        .map(
          (value, column) =>
            `<c r="${columnLetters(column)}${rowIndex + 1}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`,
        )
        .join('')
      return `<row r="${rowIndex + 1}">${cells}</row>`
    })
    .join('')
  return (
    `${XML_HEAD}<worksheet xmlns="${MAIN_NS}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    (cols === '' ? '' : `<cols>${cols}</cols>`) +
    `<sheetData>${body}</sheetData></worksheet>`
  )
}

const STYLES_XML =
  `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">` +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

const CONTENT_TYPES_XML =
  `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
  '</Types>'

const ROOT_RELS_XML =
  `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const WORKBOOK_RELS_XML =
  `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">` +
  `<Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/>` +
  `<Relationship Id="rId2" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`

export function xlsxBlob(rows: readonly (readonly string[])[], title: string): Blob {
  const workbook =
    `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    `<sheets><sheet name="${escapeXml(sheetName(title))}" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const archive = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES_XML),
    '_rels/.rels': strToU8(ROOT_RELS_XML),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(WORKBOOK_RELS_XML),
    'xl/styles.xml': strToU8(STYLES_XML),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(rows)),
  })
  return new Blob([new Uint8Array(archive)], { type: XLSX_MIME })
}
