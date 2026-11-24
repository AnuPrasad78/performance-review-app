import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { Textarea } from '../atoms/Textarea'
import type { ForwardCommitment } from '../../lib/types'

export interface ForwardCommitmentsPanelProps {
  commitments: readonly ForwardCommitment[]
  readOnly: boolean
  /** Absent on display-only renders. */
  onCommitmentChange?: (id: number, field: 'commitment' | 'support', value: string) => void
}

const COMMITMENT_HINT = 'Say what will be true by the end of 2027, with the measurable version of it.'

export function ForwardCommitmentsPanel({
  commitments,
  readOnly,
  onCommitmentChange,
}: ForwardCommitmentsPanelProps) {
  return (
    <Card>
      <div className="commitments">
        <p className="commitments__hint muted">{COMMITMENT_HINT}</p>
        {commitments.map((commitment, index) => (
          <div key={commitment.id} className="commitments__item">
            <h3 className="commitments__heading mono">Commitment {index + 1}</h3>
            <div className="commitments__row">
              <Textarea
                aria-label={`Commitment ${index + 1}`}
                value={commitment.commitment}
                disabled={readOnly}
                onChange={(event) =>
                  onCommitmentChange?.(commitment.id, 'commitment', event.target.value)
                }
              />
              <FormField id={`commitment-support-${commitment.id}`} label="Agreed support / conditions">
                <Textarea
                  id={`commitment-support-${commitment.id}`}
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
      </div>
    </Card>
  )
}
