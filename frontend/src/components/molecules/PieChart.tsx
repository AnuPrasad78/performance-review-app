export interface PieChartSlice {
  label: string
  value: number
  color: string
}

export interface PieChartProps {
  data: readonly PieChartSlice[]
  ariaLabel: string
  size?: number
}

const RADIUS = 46
const CENTER = 50

/** 2px surface gaps between fills (dataviz mark spec), expressed as degrees at the slice radius. */
const GAP_DEG = (2 / RADIUS) * (180 / Math.PI)
/** Degenerate sweeps still draw a hairline wedge so a tiny slice is never silently dropped. */
const MIN_WEDGE_DEG = 0.5

function sliceBoundary(angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return {
    x: CENTER + RADIUS * Math.cos(rad),
    y: CENTER + RADIUS * Math.sin(rad),
  }
}

function wedgePath(startDeg: number, endDeg: number): string {
  const start = sliceBoundary(startDeg)
  const end = sliceBoundary(endDeg)
  const largeArc = endDeg - startDeg > 180 ? 1 : 0
  return [
    `M ${CENTER} ${CENTER}`,
    `L ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function sliceTitle(slice: PieChartSlice, total: number): string {
  const percent = Math.round((slice.value / total) * 100)
  return `${slice.label}: ${slice.value} of ${total} (${percent}%)`
}

export function PieChart({ data, ariaLabel, size = 172 }: PieChartProps) {
  const total = data.reduce((sum, slice) => sum + slice.value, 0)
  if (total === 0) return null
  const filled = data.filter((slice) => slice.value > 0)
  const only = filled.length === 1 ? filled[0] : undefined

  let cursor = 0
  const wedges = only !== undefined ? (
    <circle cx={CENTER} cy={CENTER} r={RADIUS} fill={only.color}>
      <title>{sliceTitle(only, total)}</title>
    </circle>
  ) : (
    filled.map((slice) => {
      const sweep = (slice.value / total) * 360
      const startDeg = cursor + GAP_DEG / 2
      const endDeg = Math.max(cursor + sweep - GAP_DEG / 2, startDeg + MIN_WEDGE_DEG)
      cursor += sweep
      return (
        <path key={slice.label} d={wedgePath(startDeg, endDeg)} fill={slice.color}>
          <title>{sliceTitle(slice, total)}</title>
        </path>
      )
    })
  )

  return (
    <figure className="pie-block">
      <svg
        className="pie-block__chart"
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label={ariaLabel}
      >
        {wedges}
      </svg>
      <figcaption className="pie-legend">
        {data.map((slice) => (
          <span key={slice.label} className="pie-legend__item">
            <span className="pie-legend__swatch" style={{ background: slice.color }} aria-hidden="true" />
            <span className="pie-legend__label">{slice.label}</span>
            <span className="pie-legend__count mono">{slice.value}</span>
          </span>
        ))}
      </figcaption>
    </figure>
  )
}
