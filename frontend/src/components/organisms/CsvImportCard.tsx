import { useRef } from 'react'
import { Button } from '../atoms/Button'
import { Card } from '../atoms/Card'

export interface CsvImportCardProps {
  inFlight: boolean
  onFileSelected: (file: File) => void
}

export function CsvImportCard({ inFlight, onFileSelected }: CsvImportCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onFileSelected(file)
  }

  return (
    <Card caption="Upload roster" captionAccent>
      <p className="muted" style={{ fontSize: '13.5px', marginBottom: '16px' }}>
        Load employees from a CSV with the columns Employee Name, Employee ID, Email, Designation, Location, Org, Current Account / Project, Delivery Head, Delivery Manager, Business Partner, Reporting Manager, Status. Duplicate emails are skipped.
      </p>
      <Button variant="ghost" busy={inFlight} onClick={() => inputRef.current?.click()}>
        {inFlight ? 'Loading roster' : 'Choose CSV file'}
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleChange}
        style={{ display: 'none' }}
        aria-hidden="true"
        tabIndex={-1}
      />
    </Card>
  )
}
