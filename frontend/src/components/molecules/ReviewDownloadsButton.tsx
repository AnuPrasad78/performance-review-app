import { Button } from '../atoms/Button'

export interface ReviewDownloadsButtonProps {
  /** The backend's number of matching completed reviews; null before the
      count read lands and 0 when none match — both render without it. */
  count: number | null
  busy: boolean
  onDownload: () => void
}

/** The bulk download trigger both admin toolbars share: eligible count read
    live from the export count endpoint, so the number follows every filter. */
export function ReviewDownloadsButton({ count, busy, onDownload }: ReviewDownloadsButtonProps) {
  const eligible = count !== null && count > 0
  return (
    <Button variant="ghost" size="sm" busy={busy} disabled={!eligible || busy} onClick={onDownload}>
      {eligible ? `Download submitted reviews (${count})` : 'Download submitted reviews'}
    </Button>
  )
}
