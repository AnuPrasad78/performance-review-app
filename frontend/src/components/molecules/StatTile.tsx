import { Icon, type IconName } from '../atoms/Icon'

export type StatTone = 'default' | 'positive' | 'negative'

export interface StatTileProps {
  label: string
  value: string
  /** One muted line under the value; tone colors it positive/negative. */
  note?: string
  noteTone?: StatTone
  icon?: IconName
  iconTone?: StatTone
}

function toneClass(base: string, tone: StatTone): string {
  return tone === 'default' ? base : `${base} ${base}--${tone}`
}

export function StatTile({ label, value, note, noteTone = 'default', icon, iconTone = 'default' }: StatTileProps) {
  return (
    <div className="tile">
      <div className="tile__head">
        <span className="tile__label mono">{label}</span>
        {icon ? <Icon name={icon} size={22} className={toneClass('tile__icon', iconTone)} /> : null}
      </div>
      <span className="tile__value">{value}</span>
      {note !== undefined && note !== '' ? (
        <span className={toneClass('tile__note', noteTone)}>{note}</span>
      ) : null}
    </div>
  )
}
