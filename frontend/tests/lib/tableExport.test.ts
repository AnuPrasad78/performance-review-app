import { strFromU8, unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseCsv } from '../../src/lib/csvParse'
import { exportFileName } from '../../src/lib/exportFileName'
import { appliedFilters, filterSummary } from '../../src/lib/exportFilters'
import { saveTableExport } from '../../src/lib/tableExport'
import { columnLetters, xlsxBlob, XLSX_MIME } from '../../src/lib/xlsxBuild'

const { saveCsvBlobMock } = vi.hoisted(() => ({ saveCsvBlobMock: vi.fn() }))

vi.mock('../../src/lib/csvDownload', () => ({ saveCsvBlob: saveCsvBlobMock }))

const ON = new Date(2026, 10, 27, 9, 30)

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

beforeEach(() => {
  saveCsvBlobMock.mockReset()
})

describe('parseCsv', () => {
  it('reads quoted commas, doubled quotes, line breaks and a BOM', () => {
    const text = '﻿Name,Note\r\n"Menon, Asha","said ""hi""\nthen left"\r\nBilal,\r\n'
    expect(parseCsv(text)).toEqual([
      ['Name', 'Note'],
      ['Menon, Asha', 'said "hi"\nthen left'],
      ['Bilal', ''],
    ])
  })
})

describe('xlsxBlob', () => {
  it('packages one sheet of inline strings with a bold, frozen header', async () => {
    const blob = xlsxBlob(
      [
        ['Name', 'Formula-looking'],
        ['Asha & Co <x>', '=1+1'],
      ],
      'Review status',
    )
    expect(blob.type).toBe(XLSX_MIME)
    const files = unzipSync(await bytesOf(blob))
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">Name</t></is></c>')
    expect(sheet).toContain('Asha &amp; Co &lt;x&gt;')
    // "=1+1" stays text: inline strings are never formulas.
    expect(sheet).toContain('<c r="B2" t="inlineStr"><is><t xml:space="preserve">=1+1</t></is></c>')
    expect(sheet).not.toContain('<f>')
    expect(sheet).toContain('state="frozen"')
    expect(strFromU8(files['xl/workbook.xml'] as Uint8Array)).toContain('name="Review status"')
  })

  it('letters columns past Z', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnLetters)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })
})

describe('exportFileName', () => {
  it('names the filters in force and the local date', () => {
    expect(
      exportFileName(
        'review-status',
        [
          { label: 'Evaluation status', value: 'Self-evaluation not started' },
          { label: 'Business unit', value: 'Payer Digital' },
        ],
        'xlsx',
        ON,
      ),
    ).toBe('review-status_evaluation-status-self-evaluation-not-started_business-unit-payer-digital_2026-11-27.xlsx')
  })

  it('says all-employees when nothing narrows the export', () => {
    expect(exportFileName('employee-master-data', [], 'csv', ON)).toBe(
      'employee-master-data_all-employees_2026-11-27.csv',
    )
  })

  it('strips unsafe characters and keeps long filter runs bounded', () => {
    const name = exportFileName(
      'review-status',
      Array.from({ length: 20 }, (_, index) => ({ label: 'Search', value: `Ré/sumé "${index}" <x>` })),
      'pdf',
      ON,
    )
    expect(name).toMatch(/^[a-z0-9_-]+_2026-11-27\.pdf$/)
    expect(name.startsWith('review-status_search-re-sume-0-x_')).toBe(true)
    expect(name.length).toBeLessThanOrEqual(150 + '_2026-11-27.pdf'.length)
  })
})

describe('appliedFilters', () => {
  it('lists the narrowing words in reading order, status by its label', () => {
    const filters = appliedFilters({
      status: 'not_started',
      businessUnit: 'Payer Digital',
      search: ' ash ',
      sortBy: 'employeeName',
      sortOrder: 'desc',
    })
    expect(filters).toEqual([
      { label: 'Evaluation status', value: 'Self-evaluation not started' },
      { label: 'Search', value: 'ash' },
      { label: 'Business unit', value: 'Payer Digital' },
    ])
    expect(filterSummary(filters)).toBe(
      'Filters: Evaluation status: Self-evaluation not started · Search: ash · Business unit: Payer Digital',
    )
  })

  it('treats the "all" status and blanks as no filter', () => {
    expect(appliedFilters({ status: 'all', org: '  ' })).toEqual([])
    expect(filterSummary([])).toBe('Filters: none (all employees)')
  })
})

describe('saveTableExport', () => {
  const csv = new Blob(['Employee Name,Email\r\nAsha Menon,asha_menon@emids.com\r\n'], { type: 'application/csv' })
  const spec = { base: 'review-status', title: 'Review status', filters: [{ label: 'Org', value: 'Quality' }] }

  it('saves the server CSV untouched under the filter-named file', async () => {
    await saveTableExport(csv, 'csv', spec, ON)
    expect(saveCsvBlobMock).toHaveBeenCalledWith(csv, 'review-status_org-quality_2026-11-27.csv')
  })

  it('re-shapes the same rows into a workbook', async () => {
    await saveTableExport(csv, 'xlsx', spec, ON)
    const [blob, name] = saveCsvBlobMock.mock.calls[0] as [Blob, string]
    expect(name).toBe('review-status_org-quality_2026-11-27.xlsx')
    const sheet = strFromU8(unzipSync(await bytesOf(blob))['xl/worksheets/sheet1.xml'] as Uint8Array)
    expect(sheet).toContain('asha_menon@emids.com')
  })

  // The real jsPDF renderer runs: the file must be a PDF a viewer can open.
  it('renders the same rows as a PDF', async () => {
    await saveTableExport(csv, 'pdf', spec, ON)
    const [blob, name] = saveCsvBlobMock.mock.calls[0] as [Blob, string]
    expect(name).toBe('review-status_org-quality_2026-11-27.pdf')
    expect(blob.type).toBe('application/pdf')
    expect(strFromU8((await bytesOf(blob)).slice(0, 5))).toBe('%PDF-')
  })
})
