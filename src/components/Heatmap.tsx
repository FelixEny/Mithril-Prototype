import { memo, useRef, useState, type MouseEvent } from 'react'
import { formatNumber, heatActiveLevel } from '../analytics'
import { CardTitle } from './CardTitle'

const dayLabels = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']
const hourLabel = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`

type HeatCell = { weekday: number; hour: number; active: number; messages: number }

// The day/hour heat card owns its hover state so a mouse-moving over the grid
// only re-renders this small component — not the whole Engagement page with its
// charts. The parent re-renders (range change, new `heat` reference) and the
// card updates; unrelated page renders pass through via memo.
export const HeatmapCard = memo(function HeatmapCard({ heat }: { heat: HeatCell[][] }) {
  const [hover, setHover] = useState<{ weekday: number; hour: number; active: number; messages: number; x: number; y: number } | null>(null)
  const heatRef = useRef<HTMLDivElement>(null)
  const heatMove = (e: MouseEvent, cell: HeatCell) => {
    const r = heatRef.current?.getBoundingClientRect()
    if (!r) return
    setHover({ ...cell, x: e.clientX - r.left, y: e.clientY - r.top })
  }
  return (
    <div className="heat-main">
      <CardTitle title="Active members by day and time" />
      <div className="heat" ref={heatRef}>
        <div className="y-labels">{dayLabels.map(x => <span key={x}>{x}</span>)}</div>
        <div className="cells">{heat.flat().map(cell => {
          const level = heatActiveLevel(cell.active)
          return <button type="button" key={`${cell.weekday}-${cell.hour}`} style={{ background: `var(--heat-${level})` }} aria-label={`${dayLabels[cell.weekday]} ${hourLabel(cell.hour)}: ${formatNumber(cell.active)} active members, ${formatNumber(cell.messages)} messages`} onMouseEnter={(e) => heatMove(e, cell)} onMouseMove={(e) => heatMove(e, cell)} onMouseLeave={() => setHover(null)} />
        })}<div className="hours">{Array.from({ length: 12 }, (_, i) => <span key={i}>{hourLabel(i * 2)}</span>)}</div></div>
      </div>
      <div className="heat-footer"><div className="activity-legend"><span>Less activity</span><span className="heat-scale"><i /><i /><i /><i /><i /><i /><i /></span><span>More activity</span></div></div>
      {hover && <span className="heat-tooltip" style={{ left: Math.max(76, Math.min(hover.x, (heatRef.current?.offsetWidth ?? 900) - 76)), top: hover.y, transform: hover.y > 44 ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 12px)' }}><div className="chart-tooltip"><span className="chart-tooltip-label">{dayLabels[hover.weekday]} · {hourLabel(hover.hour)}</span><span className="chart-tooltip-row">Active members<b>{formatNumber(hover.active)}</b></span><span className="chart-tooltip-row">Messages<b>{formatNumber(hover.messages)}</b></span></div></span>}
    </div>
  )
})