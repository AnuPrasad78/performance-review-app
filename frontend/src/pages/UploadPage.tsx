import { useState } from 'react'
import { CsvImportCard } from '../components/organisms/CsvImportCard'
import { ImportConflictDialog } from '../components/organisms/ImportConflictDialog'
import { ImportErrorDialog } from '../components/organisms/ImportErrorDialog'
import { AdminTemplate } from '../components/templates/AdminTemplate'
import { applyRosterImport, importRosterCsv } from '../lib/api'
import type { Employee, RosterImportReport, RosterRowError } from '../lib/types'
import { useEmployees } from '../hooks/useEmployees'
import { useAdminStore } from '../state/AdminContext'

type FailureState = { detail: string; rowErrors: RosterRowError[] } | null

export function UploadPage() {
  const { notify } = useAdminStore()
  const roster = useEmployees({ page: 1 })
  const [analyzing, setAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [failure, setFailure] = useState<FailureState>(null)
  const [pendingConflicts, setPendingConflicts] = useState<RosterImportReport | null>(null)
  const [pendingInserts, setPendingInserts] = useState<Employee[]>([])

  async function analyzeFile(file: File): Promise<void> {
    setAnalyzing(true)
    setFailure(null)
    setPendingConflicts(null)
    const result = await importRosterCsv(file)
    setAnalyzing(false)
    if (!result.ok) {
      setFailure({ detail: result.detail, rowErrors: result.rowErrors })
      return
    }
    const conflictEmails = new Set(result.report.conflicts.map((conflict) => conflict.email))
    const inserts = result.report.employees.filter(
      (employee) => !conflictEmails.has(employee.email),
    )
    if (result.report.conflicts.length > 0) {
      setPendingConflicts(result.report)
      setPendingInserts(inserts)
      return
    }
    // No decision needed: the only valid change is adding the new rows.
    await apply({ inserts, updates: [] }, result.report)
  }

  async function apply(
    payload: { inserts: Employee[]; updates: Employee[] },
    report: RosterImportReport,
  ): Promise<void> {
    setApplying(true)
    const result = await applyRosterImport(payload)
    setApplying(false)
    if (!result.ok) {
      setFailure({ detail: result.detail, rowErrors: [] })
      return
    }
    roster.refresh()
    notify('success', describeImport(result.importedCount, result.updatedCount, report.duplicatesSkipped))
  }

  return (
    <AdminTemplate
      eyebrow="Admin · Upload"
      title="Employee data upload"
      lead="Upload employees using a roster CSV. Existing employees are matched by email, allowing you to review and update records or keep the existing details."
    >
      <CsvImportCard
        inFlight={analyzing || applying}
        onFileSelected={(file) => void analyzeFile(file)}
      />
      <p className="mono muted" style={{ fontSize: '11px', letterSpacing: '0.08em' }}>
        CURRENT ROSTER · {roster.total} {roster.total === 1 ? 'EMPLOYEE' : 'EMPLOYEES'}
      </p>
      <ImportErrorDialog
        open={failure !== null}
        detail={failure?.detail ?? ''}
        rowErrors={failure?.rowErrors ?? []}
        onDismiss={() => setFailure(null)}
      />
      <ImportConflictDialog
        open={pendingConflicts !== null}
        conflicts={pendingConflicts?.conflicts ?? []}
        importSummary={pendingConflicts === null ? '' : describeAnalysis(pendingConflicts)}
        onConfirm={(updates) => {
          if (pendingConflicts === null) return
          const report = pendingConflicts
          const inserts = pendingInserts
          setPendingConflicts(null)
          void apply({ inserts, updates }, report)
        }}
        onDismiss={() => setPendingConflicts(null)}
      />
    </AdminTemplate>
  )
}

function describeImport(imported: number, updated: number, duplicates: number): string {
  const parts: string[] = []
  if (imported > 0) {
    parts.push(`${imported} ${imported === 1 ? 'employee added' : 'employees added'}`)
  }
  if (updated > 0) {
    parts.push(`${updated} ${updated === 1 ? 'employee updated' : 'employees updated'}`)
  }
  if (duplicates > 0) {
    parts.push(`${duplicates} duplicate ${duplicates === 1 ? 'email skipped' : 'emails skipped'}`)
  }
  return parts.length === 0
    ? 'Nothing changed — the roster already matches the file.'
    : `Roster updated: ${parts.join(', ')}.`
}

function describeAnalysis(report: RosterImportReport): string {
  const newEmployees = report.importedCount
  const collided = report.conflicts.length
  return `${newEmployees} new ${newEmployees === 1 ? 'employee will be added' : 'employees will be added'} and ${collided} ${collided === 1 ? 'employee already exists' : 'employees already exist'} — choose per employee whether to update or keep the stored record.`
}
