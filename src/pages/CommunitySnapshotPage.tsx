import { useMemo } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatNumber, membershipSeries, type DashboardWindow, type MembershipPoint } from '../analytics'
import { endDate } from '../data'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { Change } from '../components/Change'
import { ChartTooltip } from '../components/ChartTooltip'
import { DateRangePicker } from '../components/DateRangePicker'
import type { RangeProps } from './EngagementPage'

const NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]

const decade = (raw: number) => Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))))

function niceStep(raw: number) {
  const m = decade(raw), n = raw / m
  const unit = NICE.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a))
  return Math.max(1, Math.ceil(unit * m))
}

function niceCeil(raw: number) {
  const m = decade(raw), n = raw / m
  const unit = NICE.find((x) => x >= n - 1e-9) ?? 10
  return Math.max(1, Math.ceil(unit * m))
}

function ticksBetween(step: number, top: number) {
  const out: number[] = []
  for (let i = 0; i * step <= top + 1e-9; i++) out.push(+(i * step).toFixed(6))
  return out
}

function rosterAxis(max: number) {
  const step = niceStep(Math.max(max, 1) / 5)
  const top = Math.ceil(Math.max(max, 1) / step) * step
  return { top, ticks: ticksBetween(step, top) }
}

function flowAxis(maxJoined: number, maxLeft: number) {
  const step = niceStep(Math.max(maxJoined, 3) / 3)
  const top = Math.ceil(Math.max(maxJoined, 3) / step) * step
  const neg = maxLeft > 0 ? niceCeil(maxLeft) : 0
  return { top, neg, ticks: [...(neg > 0 ? [-neg] : []), ...ticksBetween(step, top)] }
}

function SnapshotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MembershipPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <ChartTooltip label={p.date} value={`Total members: ${formatNumber(p.roster)}`} />
}

function FlowTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MembershipPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <div className="chart-tooltip">
    <span className="chart-tooltip-label">{p.date}</span>
    <span className="chart-tooltip-row"><i style={{ background: 'var(--content-positive)' }} />Joined<b>{formatNumber(p.joined)}</b></span>
    <span className="chart-tooltip-row"><i style={{ background: 'var(--chart-negative)' }} />Left<b>{formatNumber(p.left)}</b></span>
  </div>
}

export function CommunitySnapshotPage({ w, effDays, range, custom, onSelectPreset, onSelectRange, onBack }: { w: DashboardWindow; effDays: number } & RangeProps & { onBack: () => void }) {
  const points = useMemo(() => membershipSeries(w.start, w.end), [w])
  const flow = useMemo(() => points.map((p) => ({ ...p, negLeft: -p.left })), [points])
  const roster = useMemo(() => rosterAxis(points.reduce((m, p) => Math.max(m, p.roster), 0)), [points])
  const flowTicks = useMemo(() => flowAxis(points.reduce((m, p) => Math.max(m, p.joined), 0), points.reduce((m, p) => Math.max(m, p.left), 0)), [points])
  const dates = useMemo(() => {
    const count = Math.min(12, points.length)
    return Array.from({ length: count }, (_, i) => points[Math.round(i * (points.length - 1) / Math.max(1, count - 1))].date.split(',')[0])
  }, [points])

  return <>
    <div className="mpp-header snapshot-header">
      <div className="mpp-crumbs">
        <button type="button" className="mpp-crumb" onClick={onBack}>Overview</button>
        <CaretRight size={16} className="mpp-crumb-caret" />
        <span className="mpp-crumb-current">Community snapshot</span>
      </div>
      <DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />
    </div>
    <Card className="snapshot-card">
      <CardTitle title="Total members" />
      <div className="snapshot-stats">
        <h2>{formatNumber(w.totalMembers)}</h2>
        <Change v={w.delta.totalMembers} range={effDays} />
      </div>
      <div className="snapshot-plot snapshot-plot--area">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
            <XAxis dataKey="label" hide />
            <YAxis tickLine={false} axisLine={false} width={38} domain={[0, roster.top]} ticks={roster.ticks} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<SnapshotTooltip />} />
            <defs>
              <linearGradient id="snapshot-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="snapshot-grad-top" />
                <stop offset="1" className="snapshot-grad-bottom" />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="roster" stroke="var(--chart-brand-1)" strokeWidth={2} fill="url(#snapshot-area-fill)" fillOpacity={0.23} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-primary)', fill: 'var(--chart-brand-1)' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <CardTitle title="Joined vs left" />
      <div className="snapshot-stats snapshot-stats--flow">
        <span className="snapshot-pair"><b className="joined">{formatNumber(w.joined)}</b><span>Joined</span></span>
        <span className="snapshot-pair"><b className="left">{formatNumber(w.left)}</b><span>Left</span></span>
      </div>
      <div className="snapshot-plot snapshot-plot--bars">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flow} margin={{ top: 8, right: 0, left: 0, bottom: 8 }} barCategoryGap="23%">
            <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
            <XAxis dataKey="label" hide />
            <YAxis tickLine={false} axisLine={false} width={38} domain={[flowTicks.neg > 0 ? -flowTicks.neg : 0, flowTicks.top]} ticks={flowTicks.ticks} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<FlowTooltip />} cursor={{ fill: 'var(--surface-secondary)' }} />
            <Bar dataKey="joined" stackId="flow" fill="var(--content-positive)" radius={[2, 2, 0, 0]} maxBarSize={20} />
            <Bar dataKey="negLeft" stackId="flow" fill="var(--chart-negative)" radius={[0, 0, 2, 2]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="snapshot-dates"><div className="snapshot-dates-row">{dates.map((d, i) => <span key={i}>{d}</span>)}</div></div>
    </Card>
  </>
}
