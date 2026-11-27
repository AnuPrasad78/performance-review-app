import { useState } from 'react'
import { Button } from '../atoms/Button'

export interface DownloadCsvButtonProps {
  /** The page's export read, server-side and whole-set; awaited here so the
      button reflects the pending download. Failures surface through the
      page's own toast. */
  onDownload: () => Promise<void>
  /** The button's name — the board's status export reads differently from
      the Users roster file. */
  label?: string
}

/** The admin tables' Download CSV trigger: the server exports every row the
    composed query matches, so the only busy state is the fetch itself. */
export function DownloadCsvButton({ onDownload, label = 'Download CSV' }: DownloadCsvButtonProps) {
  const [downloading, setDownloading] = useState(false)

  async function download(): Promise<void> {
    setDownloading(true)
    try {
      await onDownload()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      busy={downloading}
      onClick={() => void download()}
    >
      {label}
    </Button>
  )
}
