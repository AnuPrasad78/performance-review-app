import { useState, type FormEvent, type MouseEvent } from 'react'
import { Button } from '../atoms/Button'
import { Input } from '../atoms/Input'
import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import { validateCycleSettings } from '../../lib/cycleValidation'
import type { CycleSettings } from '../../lib/types'

export interface CycleSettingsFormProps {
  initial: CycleSettings | null
  onSave: (settings: CycleSettings) => void
}

const EMPTY_CYCLE: CycleSettings = {
  submissionDeadline: '',
  managerReviewStart: '',
  managerReviewEnd: '',
  hrApprovalReleaseBy: '',
}

export function CycleSettingsForm({ initial, onSave }: CycleSettingsFormProps) {
  const [draft, setDraft] = useState<CycleSettings>(initial ?? EMPTY_CYCLE)
  const validation = validateCycleSettings(draft)

  function update(field: keyof CycleSettings, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (validation.isValid) onSave(draft)
  }
function openDatePicker(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget
  if (typeof input.showPicker === 'function') {
    input.showPicker()
  }
}

  return (
    <Card caption="Review cycle settings" captionAccent className="form-card">
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-body">
          <div className="form-row">
            <FormField
              id="submission-deadline"
              label="Self-evaluation submission deadline"
              required
              error={validation.fieldErrors.submissionDeadline}
            >
              <Input
                id="submission-deadline"
                type="date"
                value={draft.submissionDeadline}
                onChange={(event) => update('submissionDeadline', event.target.value)}
                onClick={openDatePicker}
              />
            </FormField>
          </div>
          <div className="form-row form-row--2">
            <FormField
              id="manager-review-start"
              label="Manager review start"
              required
              error={validation.fieldErrors.managerReviewStart}
            >
              <Input
                id="manager-review-start"
                type="date"
                value={draft.managerReviewStart}
                onChange={(event) => update('managerReviewStart', event.target.value)}
              onClick={openDatePicker}
              />
            </FormField>
            <FormField
              id="manager-review-end"
              label="Manager review end"
              required
              error={validation.fieldErrors.managerReviewEnd}
            >
              <Input
                id="manager-review-end"
                type="date"
                value={draft.managerReviewEnd}
                onChange={(event) => update('managerReviewEnd', event.target.value)}
              onClick={openDatePicker}
              />
            </FormField>
            {validation.dateError ? (
              <span className="form-date-error" role="alert">
                {validation.dateError}
              </span>
            ) : null}
          </div>
          <div className="form-row">
            <FormField
              id="hr-approval-release-by"
              label="HR approval & release by"
              required
              error={validation.fieldErrors.hrApprovalReleaseBy}
            >
              <Input
                id="hr-approval-release-by"
                type="date"
                value={draft.hrApprovalReleaseBy}
                onChange={(event) => update('hrApprovalReleaseBy', event.target.value)}
                onClick={openDatePicker}
              />
            </FormField>
          </div>
        </div>
        <div className="form-actions">
          <Button type="submit" disabled={!validation.isValid}>
            Save cycle settings
          </Button>
        </div>
      </form>
    </Card>
  )
}
