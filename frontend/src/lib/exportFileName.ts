import type { AppliedFilter } from './exportFilters'

/** File-system-safe download names that say what is inside:
    `<base>_<filter>-<value>…_<yyyy-mm-dd>.<ext>`, or `<base>_all-employees_…`
    when nothing narrows the export. Long filter runs are cut at a part
    boundary so the name stays within what every OS accepts. */

const MAX_STEM_LENGTH = 150

function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The viewer's local calendar date — the day they pressed download. */
function localIsoDate(on: Date): string {
  const month = String(on.getMonth() + 1).padStart(2, '0')
  const day = String(on.getDate()).padStart(2, '0')
  return `${on.getFullYear()}-${month}-${day}`
}

export function exportFileName(
  base: string,
  filters: readonly AppliedFilter[],
  extension: string,
  on: Date,
): string {
  const parts = filters
    .map(({ label, value }) => [slug(label), slug(value)].filter(Boolean).join('-'))
    .filter((part) => part !== '')
  let stem = slug(base)
  for (const part of parts.length > 0 ? parts : ['all-employees']) {
    if (stem.length + part.length + 1 > MAX_STEM_LENGTH) break
    stem = `${stem}_${part}`
  }
  return `${stem}_${localIsoDate(on)}.${extension}`
}
