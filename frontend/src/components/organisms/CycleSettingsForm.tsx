import { useState, type FormEvent, type MouseEvent } from 'react'
import { Button } from '../atoms/Button'
import { Input } from '../atoms/Input'
import { Card } from '../atoms/Card'
import { FormField } from '../molecules/FormField'
import {
  cycleSettingsToDraft,
  draftToCycleSettings,
  emptyCycleDraft,
  validateCycleSettings,
} from '../../lib/cycleValidation'
import type { CycleSettings } from '../../lib/types'

export interface CycleSettingsFormProps {
  initial: CycleSettings | null
  /** Saving goes to the API the page owns; the form reports both its own
      validation and the server's verdict inline (the context toast then
      confirms the accepted save). */
  onSave: (settings: CycleSettings) => Promise<{ ok: true } | { ok: false; detail: string }>
}

export function CycleSettingsForm({ initial, onSave }: CycleSettingsFormProps) {
  const [draft, setDraft] = useState(() =>
    initial === null ? emptyCycleDraft() : cycleSettingsToDraft(initial),
  )
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const validation = validateCycleSettings(draft)

  function update(field: keyof typeof draft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  function openDatePicker(event: MouseEvent<HTMLInputElement>) {
    const input = event.currentTarget
    if (typeof input.showPicker === 'function') {
      input.showPicker()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validation.isValid) return
    setServerError(null)
    setSaving(true)
    const outcome = await onSave(draftToCycleSettings(draft))
    setSaving(false)
    if (outcome.ok === false) {
      setServerError(outcome.detail)
    }
  }

  return (
    <Card caption="Review cycle settings" captionAccent className="form-card">
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-body">
          <div className="form-row">
            <FormField
              id="review-year"
              label="Review year"
              required
              error={validation.fieldErrors.reviewYear}
            >
              <Input
                id="review-year"
                type="number"
                value={draft.reviewYear}
                onChange={(event) => update('reviewYear', event.target.value)}
              />
            </FormField>
          </div>
          <div className="form-row form-row--2">
            <FormField
              id="submission-deadline-date"
              label="Self-evaluation submission deadline (UTC)"
              required
              error={validation.fieldErrors.deadlineDate}
            >
              <Input
                id="submission-deadline-date"
                type="date"
                value={draft.deadlineDate}
                onChange={(event) => update('deadlineDate', event.target.value)}
                onClick={openDatePicker}
              />
            </FormField>
            <FormField
              id="submission-deadline-time"
              label="Deadline time (UTC)"
              required
              error={validation.fieldErrors.deadlineTime}
            >
              <Input
                id="submission-deadline-time"
                type="time"
                value={draft.deadlineTime}
                onChange={(event) => update('deadlineTime', event.target.value)}
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
          <div className="form-row">
            <FormField
              id="employee-eligibility-date"
              label="Employee eligibility date"
              error={validation.fieldErrors.eligibilityDate}
            >
              <Input
                id="employee-eligibility-date"
                type="date"
                value={draft.eligibilityDate}
                onChange={(event) => update('eligibilityDate', event.target.value)}
                onClick={openDatePicker}
              />
            </FormField>
            <p className="muted">
              Employees whose Date of Joining comes after this date cannot access
              this review cycle — they will instead see the next-cycle welcome. Leave
              the field empty when there is no joining-date restriction.
            </p>
          </div>
          {serverError ? (
            <p className="form-date-error" role="alert">
              {serverError}
            </p>
          ) : null}
        </div>
        <div className="form-actions">
          <Button type="submit" disabled={!validation.isValid || saving} busy={saving}>
            Save cycle settings
          </Button>
        </div>
      </form>
    </Card>
  )
}
