import { useId } from 'react'

// An area chart for a *level* series -- a roster or active count measured over
// time. `SparkBars` remains correct for the *event* series (New members, Server
// leaves), where a bar length means "this many happened in this bucket".
//
// A level series is the case bars cannot serve. Bars are sized against the tallest
// bar in the run, and the total roster only moves 2379 -> 2507 across 90 days, so
// every bar lands within about 2px of the tallest one: a solid block that reports
// nothing. What a level series needs is its slope, and that is what the top edge of
// an area gives.
//
// The domain is therefore the series' own [min, max], not zero. That is the one
// place where an area chart is allowed to depart from the zero-baseline rule, and
// it is worth being explicit about why: in a bar chart the *length* is the
// encoding, so the baseline has to be zero for the length to mean anything. Here
// the encoding is the shape of the top edge, and against zero a 5% roster change
// is a line sitting at 95% of full height for the whole run -- the same dead chart
// wearing different clothes. The slope is still proportional; only the vertical
// offset is chosen to use the box.
//
// The stroke needs `non-scaling-stroke` because the viewBox is stretched
// non-uniformly to fill the card (`preserveAspectRatio="none"`): without it the
// 1.5px line would render up to ~2.5x thicker horizontally than vertically.
const W = 100
const H = 44
// Headroom so the stroke's top edge is not clipped by the viewBox.
const TOP = 2

export function SparkArea({ points }: { points: number[] }) {
  // Gradient ids must be unique per instance, but React's useId output contains
  // colons, which are legal in an id but awkward to interpolate into url(#...).
  const gradientId = `spark-area-fill-${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  const min = points.reduce((m, v) => Math.min(m, v), Infinity)
  const max = points.reduce((m, v) => Math.max(m, v), -Infinity)
  const range = max - min

  const x = (i: number) => (points.length > 1 ? (i / (points.length - 1)) * W : W / 2)
  // A flat series parks on the floor, which reads as a thin sliver. Centring it
  // would fill half the box and imply a magnitude the data does not have.
  const y = (v: number) => (range ? H - ((v - min) / range) * (H - TOP) : H)

  if (points.length === 0) return <svg className="spark-area" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"/>

  const line = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
  const area = `${line} L${W} ${H} L${x(0).toFixed(2)} ${H} Z`

  return <svg className="spark-area" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
    <defs>
      <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
        <stop className="spark-area-stop-top" offset="0"/>
        <stop className="spark-area-stop-bottom" offset="1"/>
      </linearGradient>
    </defs>
    <path d={area} fill={`url(#${gradientId})`}/>
    <path className="spark-area-line" d={line} vectorEffect="non-scaling-stroke"/>
  </svg>
}