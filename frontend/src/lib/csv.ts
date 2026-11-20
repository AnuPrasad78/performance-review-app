import type { CsvParseResult, Employee, RosterMergeResult } from './types'

const ROSTER_COLUMNS = ['first_name', 'last_name', 'email', 'role', 'department', 'manager'] as const

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let insideQuotes = false
  for (let i = 0; i < line.length; i++) {
    const char: string = line[i] ?? ''
    if (insideQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"'
        i++
      } else if (char === '"') {
        insideQuotes = false
      } else {
        current += char
      }
    } else if (char === '"' && current === '') {
      insideQuotes = true
    } else if (char === ',') {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

type CellParseResult = { ok: true; employee: Employee } | { ok: false; error: string }

function employeeFrom(cells: string[], lineNumber: number): CellParseResult {
  const [firstNameCell, lastNameCell, emailCell] = cells
  const firstName = firstNameCell ?? ''
  const lastName = lastNameCell ?? ''
  const email = (emailCell ?? '').toLowerCase()
  if (firstName === '' || lastName === '') {
    return { ok: false, error: `Line ${lineNumber}: first_name and last_name are required.` }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: `Line ${lineNumber}: email is missing or invalid.` }
  }
  const [role, department, manager] = cells.slice(3)
  return {
    ok: true,
    employee: {
      firstName,
      lastName,
      email,
      role: role ?? '',
      department: department ?? '',
      manager: manager ?? '',
    },
  }
}

export function parseRosterCsv(text: string): CsvParseResult {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  const header = lines.shift() ?? ''
  if (splitCsvLine(header).map((c) => c.toLowerCase()).join(',') !== ROSTER_COLUMNS.join(',')) {
    return {
      ok: false,
      error: 'The header row must list: first_name, last_name, email, role, department, manager.',
    }
  }

  const employees: Employee[] = []
  const seenEmails = new Set<string>()
  for (let i = 0; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i] ?? '')
    if (cells.every((c) => c === '')) continue
    const parsed = employeeFrom(cells, i + 2)
    if (!parsed.ok) return { ok: false, error: parsed.error }
    if (!seenEmails.has(parsed.employee.email)) {
      seenEmails.add(parsed.employee.email)
      employees.push(parsed.employee)
    }
  }
  return { ok: true, employees }
}

export function mergeRoster(existing: readonly Employee[], incoming: readonly Employee[]): RosterMergeResult {
  const existingEmails = new Set(existing.map((e) => e.email))
  const accepted: Employee[] = []
  let duplicates = 0
  for (const employee of incoming) {
    if (existingEmails.has(employee.email)) {
      duplicates++
    } else {
      existingEmails.add(employee.email)
      accepted.push(employee)
    }
  }
  return { added: accepted.length, duplicates, roster: [...existing, ...accepted] }
}
