/** RFC 4180 CSV export: quote on demand, UTF-8 BOM so Excel opens it cleanly. */
export function downloadCsv(
  filename: string,
  header: readonly string[],
  rows: readonly (readonly string[])[],
): void {
  const escape = (value: string): string =>
    /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob([String.fromCharCode(0xfeff) + csv + '\r\n'], { type: 'text/csv;charset=utf-8' })
  saveCsvBlob(blob, filename)
}

/** Saves a fetched download (the server-built roster CSV) through the same
    browser seam as downloadCsv. */
export function saveCsvBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
