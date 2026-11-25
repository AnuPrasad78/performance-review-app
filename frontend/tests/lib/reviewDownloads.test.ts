import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCompletedReviewZip } from '../../src/lib/reviewDownloads'
import type { RosterQuery, SelfEvaluationWire } from '../../src/lib/types'

const { fetchCompletedReviewsMock, saveCsvBlobMock } = vi.hoisted(() => ({
  fetchCompletedReviewsMock: vi.fn(),
  saveCsvBlobMock: vi.fn(),
}))

vi.mock('../../src/lib/api', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchCompletedReviews: fetchCompletedReviewsMock,
}))

vi.mock('../../src/lib/csvDownload', () => ({
  saveCsvBlob: saveCsvBlobMock,
}))

// The real jsPDF renderer runs here: the ZIP's entries must be actual PDFs
// the browser can open, so a stub would make the test prove nothing.
function wire(name: string, employeeId: string): SelfEvaluationWire {
  return {
    employee: {
      employeeId,
      name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}@emids.com`,
      designation: 'Software Engineer',
      location: 'India',
      org: 'Delivery',
      businessUnit: 'Payer Digital',
      project: 'Cigna One',
      deliveryHead: 'Arumugam Thiraviam',
      deliveryManager: 'Priya Raghavan',
      businessPartner: 'John D',
      reportingManager: 'Priya Raghavan',
      status: 'Active',
    },
    reviewYear: 2026,
    submissionDeadline: '2027-01-15T10:00:00+00:00',
    deadlinePassed: false,
    submittedAt: '2026-11-01',
    employeeSignedAt: '2026-11-01',
    responses: {
      contribution: 'Led the intake rewrite.',
      strengths: 'Data modelling.',
      development: 'Stakeholder reviews.',
      support: 'Mentoring.',
    },
    managerComments: {
      contribution: '',
      strengths: '',
      development: '',
      support: '',
    },
    overallRating: 4,
    overallSummary: 'A steady year.',
    forwardCommitments: [{ commitment: 'Own the intake rewrite', support: 'Lead mentoring' }],
    commitmentsEditable: false,
  }
}

const QUERY: RosterQuery = { location: 'India' }

beforeEach(() => {
  fetchCompletedReviewsMock.mockReset()
  saveCsvBlobMock.mockReset()
})

describe('downloadCompletedReviewZip', () => {
  it('streams one ZIP with one correctly-named PDF per completed review', async () => {
    fetchCompletedReviewsMock.mockResolvedValue({
      ok: true,
      reviews: [wire('Asha Menon', 'EMP-V001'), wire('Bilal Khan', 'EMP-V002')],
    })

    const result = await downloadCompletedReviewZip(QUERY)

    expect(result).toEqual({ ok: true, count: 2 })
    expect(saveCsvBlobMock).toHaveBeenCalledTimes(1)
    const [blob, filename] = saveCsvBlobMock.mock.calls[0] as [Blob, string]
    expect(filename).toBe('completed-reviews-2026.zip')
    expect(blob.type).toBe('application/zip')

    const archive = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(archive).sort()).toEqual([
      'Asha Menon — EMP-V001.pdf',
      'Bilal Khan — EMP-V002.pdf',
    ])
    for (const bytes of Object.values(archive)) {
      // Real jsPDF output, not an empty stream.
      expect(bytes.length).toBeGreaterThan(1000)
      expect(String.fromCharCode(...bytes.subarray(0, 5))).toBe('%PDF-')
    }
  })

  it('answers count 0 and saves nothing when the filter matches no reviews', async () => {
    fetchCompletedReviewsMock.mockResolvedValue({ ok: true, reviews: [] })

    const result = await downloadCompletedReviewZip(QUERY)

    expect(result).toEqual({ ok: true, count: 0 })
    expect(saveCsvBlobMock).not.toHaveBeenCalled()
  })

  it('carries the export failure to the caller untouched', async () => {
    fetchCompletedReviewsMock.mockResolvedValue({
      ok: false,
      detail: 'Could not reach the review API.',
      code: 'network_error',
    })

    const result = await downloadCompletedReviewZip(QUERY)

    expect(result).toEqual({ ok: false, detail: 'Could not reach the review API.', code: 'network_error' })
    expect(saveCsvBlobMock).not.toHaveBeenCalled()
  })
})
