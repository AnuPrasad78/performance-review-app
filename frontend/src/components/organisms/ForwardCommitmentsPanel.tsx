import { Card } from '../atoms/Card'
import { Icon } from '../atoms/Icon'
import { Textarea } from '../atoms/Textarea'
import type { ForwardCommitment } from '../../lib/types'

export interface ForwardCommitmentsPanelProps {
  commitments: readonly ForwardCommitment[]
  readOnly: boolean
  /** The first commitment is required; rendering its error makes that explicit. */
  error?: string | null
  onCommitmentChange: (id: number, field: 'commitment' | 'support', value: string) => void
  onAdd: () => void
  onRemove: (id: number) => void
}

export function ForwardCommitmentsPanel({
  commitments,
  readOnly,
  error,
  onCommitmentChange,
  onAdd,
  onRemove,
}: ForwardCommitmentsPanelProps) {
  return (
    <Card>
      <div className="commitments">
        {commitments.map((commitment, index) => (
          <div key={commitment.id} className="commitments__item">
            <div className="commitments__head">
              <h3 className="commitments__heading mono">Commitment {index + 1}</h3>
              {index > 0 && !readOnly ? (
                <button
                  type="button"
                  className="commitments__action"
                  aria-label={`Remove commitment ${index + 1}`}
                  onClick={() => onRemove(commitment.id)}
                >
                  <Icon name="minus" size={14} />
                </button>
              ) : null}
            </div>
            <div className="commitments__row">
              <div className="field">
                <Textarea
                  aria-label={`Commitment ${index + 1}`}
                  value={commitment.commitment}
                  disabled={readOnly}
                  onChange={(event) => onCommitmentChange(commitment.id, 'commitment', event.target.value)}
                />
                {index === 0 && error != null ? (
                  <span className="field__error" role="alert">{error}</span>
                ) : null}
              </div>
              <div className="field">
                <Textarea
                  id={`commitment-support-${commitment.id}`}
                  aria-label="Agreed support / conditions"
                  placeholder="Agreed support / conditions"
                  value={commitment.support}
                  disabled={readOnly}
                  onChange={(event) => onCommitmentChange(commitment.id, 'support', event.target.value)}
                />
              </div>
            </div>
          </div>
        ))}
        {!readOnly ? (
          <button
            type="button"
            className="commitments__action commitments__add"
            aria-label="Add commitment"
            onClick={onAdd}
          >
            <Icon name="plus" size={14} />
          </button>
        ) : null}
      </div>
    </Card>
  )
}
