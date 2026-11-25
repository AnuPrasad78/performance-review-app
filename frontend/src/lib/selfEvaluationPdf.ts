/** Client-side PDF export of the employee's evaluation — composed from the
    record the browser already holds; no backend involvement. jsPDF draws the
    pages; layout is A4 with fixed margins and a manual page-break cursor. */

import { jsPDF } from 'jspdf'
import { QUESTION_LABELS, RATING_SCALE_REFERENCE } from './selfEvaluationContent'
import { formatIsoDate } from './dates'
import type { SelfEvaluationDraft } from './types'

const MARGIN_MM = 18
const PAGE_BOTTOM_MM = 284

export function downloadSelfEvaluationPdf(
  draft: SelfEvaluationDraft,
  signedAt: string | null,
  fileNameBase: string,
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const contentWidth = doc.internal.pageSize.getWidth() - MARGIN_MM * 2
  let y = MARGIN_MM

  const text = (value: string, size: number, weight: 'normal' | 'bold' = 'normal'): void => {
    doc.setFont('helvetica', weight)
    doc.setFontSize(size)
    const lines = doc.splitTextToSize(value, contentWidth)
    if (y + lines.length * (size * 0.42) > PAGE_BOTTOM_MM) {
      doc.addPage()
      y = MARGIN_MM
    }
    doc.text(lines, MARGIN_MM, y)
    y += lines.length * (size * 0.42) + 4
  }

  const sectionGap = (): void => {
    y += 2
    if (y > PAGE_BOTTOM_MM) {
      doc.addPage()
      y = MARGIN_MM
    }
  }

  doc.setFillColor(71, 162, 176)
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 22, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Emids — Annual Performance Review 2026', MARGIN_MM, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Employee Self-Evaluation & Manager Assessment', MARGIN_MM, 19)
  doc.setTextColor(0, 0, 0)
  y = 34

  const identityRows: readonly (readonly [string, string])[] = [
    ['Employee', draft.employee.name],
    ['Employee ID', draft.employee.employeeId],
    ['Designation', draft.employee.designation],
    ['Location', draft.employee.location],
    ['Org / Project', `${draft.employee.org} / ${draft.employee.project}`],
    ['Reporting manager', draft.employee.reportingManager],
    ['Performance period', '1-Jan-2026 to 31-Dec-2026'],
  ]
  for (const [label, value] of identityRows) {
    if (y > PAGE_BOTTOM_MM) {
      doc.addPage()
      y = MARGIN_MM
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`${label}:`, MARGIN_MM, y)
    doc.setFont('helvetica', 'normal')
    doc.text(value, MARGIN_MM + 40, y)
    y += 5.5
  }
  sectionGap()

  for (const question of draft.questions) {
    text(`${QUESTION_LABELS[question.id]}. ${question.question}`, 10.5, 'bold')
    text(question.employeeResponse, 9.5)
    if (question.managerComment !== null && question.managerComment.trim() !== '') {
      text('Manager comment', 9.5, 'bold')
      text(question.managerComment, 9.5)
    }
    sectionGap()
  }

  const rating = RATING_SCALE_REFERENCE.find((entry) => entry.value === draft.overallRating)
  text('Overall self-rating', 10.5, 'bold')
  if (draft.overallRating === null || rating === undefined) {
    text('Not given.', 9.5)
  } else {
    text(`${draft.overallRating} — ${rating.name}`, 9.5)
  }
  text('Overall comments', 10.5, 'bold')
  text(draft.overallSummary, 9.5)
  sectionGap()

  const filledCommitments = draft.commitments.filter((one) => one.commitment.trim() !== '')
  if (filledCommitments.length > 0) {
    text('Forward commitments for 2027', 10.5, 'bold')
    for (const [index, commitment] of filledCommitments.entries()) {
      text(`Commitment ${index + 1}`, 9.5, 'bold')
      text(commitment.commitment, 9.5)
      if (commitment.support.trim() !== '') {
        text(`Agreed support / conditions: ${commitment.support}`, 9.5)
      }
      sectionGap()
    }
  }

  text('Employee sign-off', 10.5, 'bold')
  text(`${draft.employee.name} — ${formatIsoDate(signedAt ?? '') || 'Not signed'}`, 9.5)

  doc.save(`${fileNameBase}-${draft.employee.employeeId}.pdf`)
}
