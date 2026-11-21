import { Card } from '../atoms/Card'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface SignOffPanelProps {
  employee: SelfEvaluationEmployee
  /** ISO date the app stamped on sign-off; null until confirmed. */
  signedAt: string | null
  readOnly: boolean
  onConfirm: () => void
}

export function SignOffPanel({ employee, signedAt, readOnly, onConfirm }: SignOffPanelProps) {
  return (
    <Card>
      <div className="signoff">
        <p className="signoff__statement">
          I confirm the 2026 review discussion took place and the ratings and comments were shared with me.
        </p>
        <div className="signoff__row">
          <div className="signoff__field">
            <span className="field__label">Name</span>
            <span className="signoff__value mono">
              {employee.firstName} {employee.lastName}
            </span>
          </div>
          <div className="signoff__field">
            <span className="field__label">Date</span>
            <span className="signoff__value mono">{signedAt ?? '—'}</span>
          </div>
        </div>
        {signedAt === null && !readOnly ? (
          <button type="button" className="btn btn--ghost" onClick={onConfirm}>
            Confirm and sign off
          </button>
        ) : null}
      </div>
    </Card>
  )
}
