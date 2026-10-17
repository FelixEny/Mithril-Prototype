import { memo, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { formatNumber, heatActiveLevel } from '../analytics'
import { CardTitle } from './CardTitle'

const dayLabels = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']
const hourLabel = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`

type HeatCell = { weekday: number; hour: number; active: number; messages: number }
type HeatHover = HeatCell & { x: number; y: number }

// The day/hour heat card owns its hover state so a mouse-moving over the grid
// only re-renders this small component — not the whole Engagement page with its
// charts. The parent re-renders (range change, new `heat` reference) and the
// card updates; unrelated page renders pass through via memo.
//
// Hover is delegated to the .cells container rather than per-cell handlers: a
// fast cursor crosses the gaps between buttons, and per-cell leave/enter pairs
// used to unmount and remount the tooltip on every crossing (flicker). The
// container keeps the tooltip mounted across cells — position and content
// update in place with no delay and no re-animation — and only closes it when
// the pointer actually leaves the grid, fading out first.
export const HeatmapCard = memo(function HeatmapCard({ heat }: { heat: HeatCell[][] }) {
  const [hover, setHover] = useState<HeatHover | null>(null)
  const [tipOpen, setTipOpen] = useState(false)
  const lastHover = useRef<HeatHover | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const heatRef = useRef<HTMLDivElement>(null)
  const cellByKey = useMemo(() => {
    const m = new Map<string, HeatCell>()
    for (const row of heat) for (const c of row) m.set(`${c.weekday}-${c.hour}`, c)
    return m
  }, [heat])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])
  const cellsMove = (e: MouseEvent) => {
    const key = (e.target as HTMLElement).closest<HTMLElement>('[data-heat]')?.dataset.heat
    const cell = key ? cellByKey.get(key) : undefined
    if (!cell) return
    const r = heatRef.current?.getBoundingClientRect()
    if (!r) return
    window.clearTimeout(closeTimer.current)
    const next = { ...cell, x: e.clientX - r.left, y: e.clientY - r.top }
    lastHover.current = next
    setHover(next)
    setTipOpen(true)
  }
  const cellsLeave = () => {
    setHover(null)
    closeTimer.current = window.setTimeout(() => setTipOpen(false), 100)
  }
  const tip = hover ?? lastHover.current
  return (
    <div className="heat-main">
      <CardTitle title="Active members by day and time" />
      <div className="heat" ref={heatRef}>
        <div className="y-labels">{dayLabels.map(x => <span key={x}>{x}</span>)}</div>
        <div className="cells" onMouseMove={cellsMove} onMouseLeave={cellsLeave}>{heat.flat().map(cell => {
          const level = heatActiveLevel(cell.active)
          return <button type="button" key={`${cell.weekday}-${cell.hour}`} data-heat={`${cell.weekday}-${cell.hour}`} style={{ background: `var(--heat-${level})` }} aria-label={`${dayLabels[cell.weekday]} ${hourLabel(cell.hour)}: ${formatNumber(cell.active)} active members, ${formatNumber(cell.messages)} messages`} />
        })}<div className="hours">{Array.from({ length: 12 }, (_, i) => <span key={i}>{hourLabel(i * 2)}</span>)}</div></div>
        {tipOpen && tip && <span className={`heat-tooltip${hover ? '' : ' off'}`} style={{ left: Math.max(76, Math.min(tip.x, (heatRef.current?.offsetWidth ?? 900) - 76)), top: tip.y, transform: tip.y > 44 ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 12px)' }}><div className="chart-tooltip"><span className="chart-tooltip-label">{dayLabels[tip.weekday]} · {hourLabel(tip.hour)}</span><span className="chart-tooltip-row">Active members<b>{formatNumber(tip.active)}</b></span><span className="chart-tooltip-row">Messages<b>{formatNumber(tip.messages)}</b></span></div></span>}
      </div>
      <div className="heat-footer"><div className="activity-legend"><span>Less activity</span><span className="heat-scale"><i /><i /><i /><i /><i /><i /><i /></span><span>More activity</span></div></div>
    </div>
  )
})
