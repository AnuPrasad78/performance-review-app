import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { Icon } from '../atoms/Icon'
import { Textarea } from '../atoms/Textarea'
import type { ForwardCommitment } from '../../lib/types'

export interface ForwardCommitmentsPanelProps {
  commitments: readonly ForwardCommitment[]
  readOnly: boolean
  onAdd: () => void
  onRemove: (id: number) => void
  /** Absent on display-only renders. */
  onCommitmentChange?: (id: number, field: 'commitment' | 'support', value: string) => void
  /** The first commitment is required; rendering its error makes that explicit. */
  error?: string | null
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
            {index > 0 && !readOnly ? (
              <div className="commitments__head">
                <button
                  type="button"
                  className="commitments__action"
                  aria-label={`Remove commitment ${index + 1}`}
                  onClick={() => onRemove(commitment.id)}
                >
                  <Icon name="minus" size={14} />
                </button>
              </div>
            ) : null}
            <div className="commitments__row">
              <FormField
                id={`commitment-${commitment.id}`}
                label="Commitment"
                error={index === 0 ? (error ?? null) : null}
              >
                <Textarea
                  id={`commitment-${commitment.id}`}
                  aria-label={`Commitment ${index + 1}`}
                  value={commitment.commitment}
                  disabled={readOnly}
                  onChange={(event) =>
                    onCommitmentChange?.(commitment.id, 'commitment', event.target.value)
                  }
                />
              </FormField>
              <FormField id={`commitment-support-${commitment.id}`} label="Agreed support / conditions">
                <Textarea
                  id={`commitment-support-${commitment.id}`}
                  aria-label="Agreed support / conditions"
                  value={commitment.support}
                  disabled={readOnly}
                  onChange={(event) =>
                    onCommitmentChange?.(commitment.id, 'support', event.target.value)
                  }
                />
              </FormField>
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
