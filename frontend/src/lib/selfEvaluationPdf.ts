/** Client-side PDF export of the employee's evaluation — composed from the
    record the browser already holds; no backend involvement. jsPDF draws the
    pages; layout is A4 with fixed margins and a manual page-break cursor.

    One renderer serves every download: the employee dashboard's sign-off copy
    (draft + manager comments) and the admin review downloads (the wire's
    document, manager columns excluded) compose a ReviewPdfDocument and share
    renderReviewPdf, so individual and bulk exports are pixel-identical. */

import { jsPDF } from 'jspdf'
import { QUESTION_LABELS, RATING_SCALE_REFERENCE, REVIEW_QUESTIONS } from './selfEvaluationContent'
import { formatIsoDate } from './dates'
import type {
  Employee,
  SelfEvaluationDraft,
  SelfEvaluationWire,
} from './types'

const MARGIN_MM = 18
const PAGE_BOTTOM_MM = 284

export interface ReviewPdfQuestion {
  label: string
  question: string
  employeeResponse: string
  managerComment: string | null
}

export interface ReviewPdfDocument {
  employee: Employee
  questions: readonly ReviewPdfQuestion[]
  overallRating: number | null
  overallSummary: string
  commitments: readonly { commitment: string; support: string }[]
}

/** The employee dashboard's composition: the draft's fixed questions with
    whatever manager comments the record carries, signed off by its own read. */
function documentFromDraft(draft: SelfEvaluationDraft): ReviewPdfDocument {
  return {
    employee: draft.employee,
    questions: draft.questions.map((question) => ({
      label: QUESTION_LABELS[question.id],
      question: question.question,
      employeeResponse: question.employeeResponse,
      managerComment: question.managerComment,
    })),
    overallRating: draft.overallRating,
    overallSummary: draft.overallSummary,
    commitments: draft.commitments,
  }
}

/** The admin review document's composition: the fixed 2026 questions fed from
    the wire's positional answers, forward commitments as stored, and no
    manager columns — the review PDF the admin downloads covers the
    self-evaluation alone. */
export function reviewDocument(wire: SelfEvaluationWire): ReviewPdfDocument {
  return {
    employee: wire.employee,
    questions: REVIEW_QUESTIONS.map((question) => ({
      label: QUESTION_LABELS[question.id],
      question: question.question,
      employeeResponse: wire.responses[question.id],
      managerComment: null,
    })),
    overallRating: wire.overallRating,
    overallSummary: wire.overallSummary,
    commitments: wire.forwardCommitments,
  }
}

function renderReviewPdf(
  document: ReviewPdfDocument,
  signedAt: string | null,
  caption: string,
): jsPDF {
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
  doc.text(caption, MARGIN_MM, 19)
  doc.setTextColor(0, 0, 0)
  y = 34

  const identityRows: readonly (readonly [string, string])[] = [
    ['Employee', document.employee.name],
    ['Employee ID', document.employee.employeeId],
    ['Designation', document.employee.designation],
    ['Location', document.employee.location],
    ['Org / Project', `${document.employee.org} / ${document.employee.project}`],
    ['Reporting manager', document.employee.reportingManager],
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

  for (const question of document.questions) {
    text(`${question.label}. ${question.question}`, 10.5, 'bold')
    text(question.employeeResponse, 9.5)
    if (question.managerComment !== null && question.managerComment.trim() !== '') {
      text('Manager comment', 9.5, 'bold')
      text(question.managerComment, 9.5)
    }
    sectionGap()
  }

  const rating = RATING_SCALE_REFERENCE.find((entry) => entry.value === document.overallRating)
  text('Overall self-rating', 10.5, 'bold')
  if (document.overallRating === null || rating === undefined) {
    text('Not given.', 9.5)
  } else {
    text(`${document.overallRating} — ${rating.name}`, 9.5)
  }
  text('Overall comments', 10.5, 'bold')
  text(document.overallSummary, 9.5)
  sectionGap()

  const filledCommitments = document.commitments.filter((one) => one.commitment.trim() !== '')
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
  text(`${document.employee.name} — ${formatIsoDate(signedAt ?? '') || 'Not signed'}`, 9.5)

  return doc
}

export function downloadSelfEvaluationPdf(
  draft: SelfEvaluationDraft,
  signedAt: string | null,
  fileNameBase: string,
): void {
  renderReviewPdf(
    documentFromDraft(draft),
    signedAt,
    'Employee Self-Evaluation & Manager Assessment',
  ).save(`${fileNameBase}-${draft.employee.employeeId}.pdf`)
}

/** The admin review PDF, as a Blob: the single format both the profile card's
    individual download and the bulk ZIP stream through. */
export function selfEvaluationPdfBlob(wire: SelfEvaluationWire): Blob {
  return renderReviewPdf(reviewDocument(wire), wire.employeeSignedAt, 'Employee Self-Evaluation').output(
    'blob',
  ) as Blob
}
