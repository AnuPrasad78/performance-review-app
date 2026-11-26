/** Read-only full view of every answered review field. Optional entries the
    employee left blank (manager comments, second/third commitments, a
    commitment's support) render only when filled. */

import { Card } from '../atoms/Card'
import { QUESTION_LABELS, RATING_SCALE_REFERENCE } from '../../lib/selfEvaluationContent'
import { formatIsoDate, todayIsoDate } from '../../lib/dates'
import type { SelfEvaluationDraft } from '../../lib/types'

export interface ReviewPreviewPanelProps {
  draft: SelfEvaluationDraft
  signedAt: string | null
}

export function ReviewPreviewPanel({ draft, signedAt }: ReviewPreviewPanelProps) {
  const rating = RATING_SCALE_REFERENCE.find((entry) => entry.value === draft.overallRating)
  const filledCommitments = draft.commitments.filter((one) => one.commitment.trim() !== '')

  return (
    <div className="preview">
      <Card caption="Employee details" captionAccent>
        <dl className="preview__grid">
          {[
            ['Employee', draft.employee.name],
            ['Employee ID', draft.employee.employeeId],
            ['Designation', draft.employee.designation],
            ['Location', draft.employee.location],
            ['Org / Project', `${draft.employee.org} / ${draft.employee.project}`],
            ['Reporting manager', draft.employee.reportingManager],
            ['Delivery Head', draft.employee.deliveryHead],
            ['Business Partner', draft.employee.businessPartner],
            ['Performance period', '1-Jan-2026 to 31-Dec-2026'],
            ['Sign-off date', formatIsoDate(signedAt ?? todayIsoDate())],
          ].map(([label, value]) => (
            <div key={label} className="preview__field">
              <dt className="preview__label">{label}</dt>
              <dd className="preview__value">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {draft.questions.map((question) => {
        const hasManagerComment =
          question.managerComment !== null && question.managerComment.trim() !== ''
        return (
          <Card key={question.id} caption={`${QUESTION_LABELS[question.id]}. ${question.title}`}>
            <p className="preview__prompt muted">{question.question}</p>
            <p className="preview__answer">{question.employeeResponse}</p>
            {hasManagerComment ? (
              <div className="preview__manager">
                <p className="preview__label">Manager comment</p>
                <p className="preview__answer">{question.managerComment}</p>
              </div>
            ) : null}
          </Card>
        )
      })}

      <Card caption="Overall rating & feedback" captionAccent>
        <div className="preview__field">
          <p className="preview__label">Overall self-rating</p>
          <p className="preview__answer mono">
            {rating === undefined ? '—' : `${draft.overallRating} — ${rating.name}`}
          </p>
        </div>
        <div className="preview__field">
          <p className="preview__label">Overall comments</p>
          <p className="preview__answer">{draft.overallSummary}</p>
        </div>
      </Card>

      {filledCommitments.length > 0 ? (
        <Card caption="Forward commitments for 2027">
          {filledCommitments.map((commitment, index) => (
            <div key={commitment.id} className="preview__field">
              <p className="preview__label">Commitment {index + 1}</p>
              <p className="preview__answer">{commitment.commitment}</p>
              {commitment.support.trim() !== '' ? (
                <p className="preview__answer muted">
                  Agreed support / conditions: {commitment.support}
                </p>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}
    </div>
  )
}
