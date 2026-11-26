/** Neutral placeholder band for in-flight content. The atom stays generic:
    callers decide shape and size; the shimmer lives in the stylesheet, and
    honors the reduced-motion preference there. */
export interface SkeletonProps {
  /** Size in any CSS unit; defaults size it from context stylesheets. */
  width?: string
  height?: string
  /** Round placeholder — chart donuts, avatars. */
  circle?: boolean
}

export function Skeleton({ width, height, circle = false }: SkeletonProps) {
  const style: React.CSSProperties = {}
  if (width !== undefined) style.width = width
  if (height !== undefined) style.height = height
  return <span className={circle ? 'skeleton skeleton--circle' : 'skeleton'} style={style} aria-hidden="true" />
}
