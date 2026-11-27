import { COMPLETION_FILTERS } from './reviewStatusStore'
import type { RosterQuery } from './types'

/** The filters an admin export was drawn under, in reading order — the one
    description both the file name and the PDF heading are built from, so
    the two can never disagree. Sort and page are not filters: they change
    the order or the slice, never which employees are in the file. */

export interface AppliedFilter {
  label: string
  value: string
}

const FILTER_LABELS: readonly (readonly [keyof RosterQuery, string])[] = [
  ['status', 'Evaluation status'],
  ['search', 'Search'],
  ['designation', 'Designation'],
  ['businessUnit', 'Business unit'],
  ['businessPartner', 'Business partner'],
  ['org', 'Org'],
  ['location', 'Location'],
  ['reportingManager', 'Reporting manager'],
  ['employmentStatus', 'Employment status'],
]

function displayValue(key: keyof RosterQuery, value: string): string {
  if (key !== 'status') return value
  return COMPLETION_FILTERS.find((option) => option.value === value)?.label ?? value
}

export function appliedFilters(query: RosterQuery): AppliedFilter[] {
  return FILTER_LABELS.flatMap(([key, label]) => {
    const raw = query[key]
    if (typeof raw !== 'string') return []
    const value = raw.trim()
    // "all" is the status filter's no-op word, not a narrowing.
    if (value === '' || (key === 'status' && value === 'all')) return []
    return [{ label, value: displayValue(key, value) }]
  })
}

export function filterSummary(filters: readonly AppliedFilter[]): string {
  if (filters.length === 0) return 'Filters: none (all employees)'
  return `Filters: ${filters.map(({ label, value }) => `${label}: ${value}`).join(' · ')}`
}
