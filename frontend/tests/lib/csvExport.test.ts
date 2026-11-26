import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchReviewStatusCsvExport, fetchRosterCsvExport } from '../../src/lib/api'
import type { RosterCsvExportResult, RosterQuery } from '../../src/lib/types'

const fetchSpy = vi.spyOn(window, 'fetch')

afterEach(() => {
  fetchSpy.mockReset()
})

function csvResponse(): Response {
  return new Response(new Blob(['csv'], { type: 'text/csv' }), {
    headers: { 'content-type': 'application/csv;charset=utf-8' },
  })
}

describe('the whole-set CSV fetches', () => {
  it('the review board export rides /api/evaluations/export/status over the whole matched set', async () => {
    fetchSpy.mockResolvedValue(csvResponse())

    const result: RosterCsvExportResult = await fetchReviewStatusCsvExport({
      page: 3,
      status: 'self_evaluation_in_progress',
      location: 'India',
      sortBy: 'employeeName',
      sortOrder: 'desc',
    } as RosterQuery)

    expect(result.ok).toBe(true)
    // The page slice never rides the export; the search/filter words and the
    // board's own status word do, while the default sort words stay omitted.
    const url = new URL(fetchSpy.mock.calls[0]![0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/evaluations/export/status')
    expect(url.searchParams.get('page')).toBeNull()
    expect(url.searchParams.get('status')).toBe('self_evaluation_in_progress')
    expect(url.searchParams.get('location')).toBe('India')
    expect(url.searchParams.get('sortOrder')).toBe('desc')
  })

  it('the roster export keeps its wire shapes', async () => {
    fetchSpy.mockResolvedValue(csvResponse())

    await fetchRosterCsvExport({ page: 2, search: 'ash' } as RosterQuery)

    const url = new URL(fetchSpy.mock.calls[0]![0] as string, 'http://localhost')
    expect(url.pathname).toBe('/api/employees/export')
    expect(url.searchParams.get('search')).toBe('ash')
    expect(url.searchParams.get('page')).toBeNull()
  })

  it('a non-CSV answer reads as an unavailable environment, not a blob', async () => {
    fetchSpy.mockResolvedValue(new Response('{}', { headers: { 'content-type': 'application/json' } }))

    const result = await fetchReviewStatusCsvExport({ page: 1, status: 'all' } as RosterQuery)

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.detail).toContain('only available where the review API is running')
  })
})
