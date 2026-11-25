/** The admin review downloads' one seam: the profile card's individual PDF,
    and the bulk ZIP of every completed review the composed roster query
    matches. Both render through selfEvaluationPdf's shared renderer, save
    through the browser blob seam (csvDownload), and are fed by the same
    evaluation document the /evaluations/me read serves. */

import { zipSync } from 'fflate'
import { saveCsvBlob } from './csvDownload'
import { fetchCompletedReviews } from './api'
import { selfEvaluationPdfBlob } from './selfEvaluationPdf'
import type { RosterQuery, SelfEvaluationWire } from './types'

type ZipDownloadResult =
  | { ok: true; count: number }
  | { ok: false; detail: string; code: string }

/** Windows' forbidden file characters — a roster name or ID may carry any of
    them, but the ZIP entry and the saved PDF must not. */
const FILENAME_BAD_CHARS = /[\\/:*?"<>|]/g

function pdfFileName(wire: SelfEvaluationWire): string {
  const name = wire.employee.name.replaceAll(FILENAME_BAD_CHARS, '').trim()
  return `${name} — ${wire.employee.employeeId}.pdf`
}

/** One employee's review PDF, saved under its name and ID. */
export function saveReviewPdf(wire: SelfEvaluationWire): void {
  saveCsvBlob(selfEvaluationPdfBlob(wire), pdfFileName(wire))
}

export async function downloadCompletedReviewZip(
  query: RosterQuery,
): Promise<ZipDownloadResult> {
  const result = await fetchCompletedReviews(query)
  if (!result.ok) return { ok: false, detail: result.detail, code: result.code }
  const [first] = result.reviews
  if (first === undefined) return { ok: true, count: 0 }

  // Sync render loop over the full matched set: one fetch, N small A4 PDFs,
  // one zip answer — the roster is sized for it.
  const entries: Record<string, Uint8Array> = {}
  for (const wire of result.reviews) {
    const bytes = new Uint8Array(await selfEvaluationPdfBlob(wire).arrayBuffer())
    entries[pdfFileName(wire)] = bytes
  }
  const archive = zipSync(entries, { level: 6 })
  saveCsvBlob(new Blob([new Uint8Array(archive)], { type: 'application/zip' }), `completed-reviews-${first.reviewYear}.zip`)
  return { ok: true, count: result.reviews.length }
}
