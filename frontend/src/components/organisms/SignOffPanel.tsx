import type { ReactNode } from 'react'
import { FormField } from '../molecules/FormField'
import { Input } from '../atoms/Input'
import { Icon } from '../atoms/Icon'
import type { SelfEvaluationEmployee } from '../../lib/types'

export interface SignOffPanelProps {
  employee: SelfEvaluationEmployee
  managerName: string
  /** ISO date the app stamped on employee sign-off; null until confirmed. */
  signedAt: string | null
  /** Document status label, e.g. "Submitted". */
  formStatusLabel: string
  readOnly: boolean
  onConfirm: () => void
}

interface SignoffRoleCardProps {
  title: string
  /** Person who signs this slot. */
  who?: string
  signedAtDate: string | null
  waitingText: string
  children?: ReactNode
}

const SIGNOFF_ORDER_LINE =
  'Sign-offs happen in order: the employee signs first, then the manager, then the business partner — each in their own login.'
const CONFIRM_STATEMENT =
  'I confirm the 2026 review discussion took place and the ratings and comments were shared with me.'

function SignoffRoleCard({ title, who, signedAtDate, waitingText, children }: SignoffRoleCardProps) {
  return (
    <article className="signoff-card">
      <h3 className="signoff-card__title">{title}</h3>
      {signedAtDate !== null ? (
        <p className="signoff-card__signed">
          <Icon name="check" size={14} />
          <span>
            Signed by {who} on {signedAtDate}
          </span>
        </p>
      ) : (
        <p className="signoff-card__waiting muted">{waitingText}</p>
      )}
      {children ?? null}
    </article>
  )
}

export function SignOffPanel({
  employee,
  managerName,
  signedAt,
  formStatusLabel,
  readOnly,
  onConfirm,
}: SignOffPanelProps) {
  const fullEmployeeName = `${employee.firstName} ${employee.lastName}`
  return (
    <div className="signoff">
      <p className="signoff__order muted">{SIGNOFF_ORDER_LINE}</p>
      <p className="signoff__status-line">
        Form status right now: <strong>{formStatusLabel}</strong>.
      </p>
      <div className="signoff__cards">
        <SignoffRoleCard
          title="Employee"
          who={fullEmployeeName}
          signedAtDate={signedAt}
          waitingText="Not signed. Confirm below to sign."
        >
          <p className="signoff-card__statement">{CONFIRM_STATEMENT}</p>
          {signedAt === null && !readOnly ? (
            <button type="button" className="btn btn--ghost" onClick={onConfirm}>
              Confirm and sign off
            </button>
          ) : null}
        </SignoffRoleCard>
        <SignoffRoleCard title="Manager" who={managerName} signedAtDate={null} waitingText={`Waiting — ${managerName}`} />
        <SignoffRoleCard title="Business partner" signedAtDate={null} waitingText="Waiting" />
      </div>
      <div className="details-grid">
        <FormField id="career-conversation-date" label="Next career conversation scheduled for">
          <Input id="career-conversation-date" value="" readOnly placeholder="Not scheduled yet." />
        </FormField>
        <FormField id="sign-off-status" label="Sign-off status">
          <Input
            id="sign-off-status"
            value={signedAt === null ? 'Waiting — employee sign-off first' : 'In progress — employee signed only'}
            readOnly
          />
        </FormField>
      </div>
    </div>
  )
}
