import { useMemo, useState } from 'react'
import { CaretRight } from '@phosphor-icons/react'
import { Line, LineChart, Bar, BarChart, CartesianGrid, Rectangle, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { BarShapeProps } from 'recharts'
import { dashboard, dashboardWindow, formatNumber, formatTimestamp, membershipSeries, monthNames, RangeDays, type MembershipPoint } from '../analytics'
import { endDate, membershipFlow, type Member } from '../data'
import { DEFAULT_RANGE } from '../ranges'
import { getMemberAvatar } from '../avatars'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { Change } from '../components/Change'
import { ChartTooltip } from '../components/ChartTooltip'
import { DateRangePicker } from '../components/DateRangePicker'

const DAY = 86400000

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

function rosterAxis(values: number[]) {
  const min = Math.min(...values), max = Math.max(...values), latest = values[values.length - 1]
  const span = Math.max(max - min, latest * 0.05)
  const mid = (min + max) / 2
  const step = niceStep(span / 4)
  const lo = Math.floor((mid - span / 2) / step) * step
  const hi = Math.ceil((mid + span / 2) / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(6))
  return { lo, hi, ticks }
}

function flowAxis(maxJoined: number, maxLeft: number) {
  const step = niceStep(Math.max(maxJoined, 3) / 3)
  const top = Math.ceil(Math.max(maxJoined, 3) / step) * step
  const neg = maxLeft > 0 ? niceCeil(maxLeft) : 0
  return { top, neg, ticks: [...(neg > 0 ? [-neg] : []), ...ticksBetween(step, top)] }
}

function gapBar(zeroEdge: 'bottom' | 'top') {
  return function Shape({ x = 0, y = 0, width = 0, height = 0, radius, fill }: BarShapeProps) {
    const h = Math.abs(height)
    if (!width || h <= 1) return null
    const top = Math.min(y, y + height)
    return zeroEdge === 'bottom'
      ? <Rectangle x={x} y={top} width={width} height={h - 1} radius={radius} fill={fill} />
      : <Rectangle x={x} y={top + 1} width={width} height={h - 1} radius={radius} fill={fill} />
  }
}

function SnapshotTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: MembershipPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <ChartTooltip label={p.date} value={`Total members: ${formatNumber(p.roster)}`} />
}

// Axis labels use the short "M/D" point key ("8/10") and render it as "Aug 10".
function shortTick(v: string) {
  const [m, d] = v.split('/').map(Number)
  return m >= 1 && m <= 12 && Number.isFinite(d) ? `${monthNames[m - 1]} ${d}` : v
}

// Recharts clones the tick element with the styled tick class and the tick's
// x/y/index, so this only pins the anchor: first tick starts at its point,
// last tick ends at its point, everything else stays centred. The dy matches
// the default tick's cap-height offset, so the text sits exactly where a
// default Recharts tick would.
function EdgeTick({ x = 0, y = 0, index = 0, visibleTicksCount = 1, payload, className }: {
  x?: number; y?: number; index?: number; visibleTicksCount?: number;
  payload?: { value?: string | number }; className?: string
}) {
  const anchor = index === 0 ? 'start' : index === visibleTicksCount - 1 ? 'end' : 'middle'
  return <text x={x} y={y} dy="0.71em" textAnchor={anchor} className={className}>{shortTick(String(payload?.value ?? ''))}</text>
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

function MoveList({ title, tone, rows, empty }: { title: string; tone: 'joined' | 'left'; rows: MoveRow[]; empty: string }) {
  return <section className="move-list">
    <div className="move-list-head">
      <i className={`move-dot ${tone}`} />
      <span className="move-list-title">{title}</span>
      <span className="move-list-count">{formatNumber(rows.length)}</span>
    </div>
    {rows.length === 0
      ? <div className="move-empty">{empty}</div>
      : <div className="move-rows">{rows.map(({ member, at }) => <div className="move-row" key={member.id}>
          <span className="move-member">
            <Avatar spec={getMemberAvatar(member.id)} name={member.name} size={28} />
            <span className="move-meta"><b>{member.name}</b>{member.username && <em>@{member.username}</em>}</span>
          </span>
          <span className="move-when">{formatTimestamp(at)}</span>
        </div>)}</div>}
  </section>
}

type MoveRow = { member: Member; at: Date }

export function CommunitySnapshotPage({ onBack }: { onBack: () => void }) {
  // The drill-down owns its own reporting period rather than borrowing the
  // Overview's: the Overview pins everything to 28 days so its insights, feed
  // and strength score stay coherent, while this page is the one surface where
  // a visitor can widen or narrow the window. It opens on the same 28 days the
  // Overview card was showing.
  const [range, setRange] = useState<RangeDays>(DEFAULT_RANGE)
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null)
  const w = useMemo(() => (custom ? dashboardWindow(custom.from, custom.to) : dashboard(range)), [range, custom])
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range
  const points = useMemo(() => membershipSeries(w.start, w.end), [w])
  const flow = useMemo(() => points.map((p) => ({ ...p, negLeft: -p.left })), [points])
  const roster = useMemo(() => rosterAxis(points.map((p) => p.roster)), [points])
  const flowTicks = useMemo(() => flowAxis(points.reduce((m, p) => Math.max(m, p.joined), 0), points.reduce((m, p) => Math.max(m, p.left), 0)), [points])
  const movement = useMemo(() => {
    const { joined, left } = membershipFlow(w.start, w.end)
    const rows = (list: Member[], at: (m: Member) => Date | null): MoveRow[] =>
      list.flatMap((member) => { const when = at(member); return when ? [{ member, at: when }] : [] })
        .sort((a, b) => b.at.getTime() - a.at.getTime())
    return { joined: rows(joined, (m) => m.joinedAt), left: rows(left, (m) => m.leftAt) }
  }, [w])
  // Up to 12 tick positions sampled from the actual points (first and last
  // always shown), passed as the axis' own `ticks` so every label sits exactly
  // on its day's point or bar at any range length.
  const tickLabels = useMemo(() => {
    const count = Math.min(12, points.length)
    const seen = new Set<string>()
    const out: string[] = []
    for (let i = 0; i < count; i++) {
      const v = points[Math.round(i * (points.length - 1) / Math.max(1, count - 1))].label
      if (!seen.has(v)) { seen.add(v); out.push(v) }
    }
    return out
  }, [points])

  return <>
    <div className="mpp-header snapshot-header">
      <div className="mpp-crumbs">
        <button type="button" className="mpp-crumb" onClick={onBack}>Overview</button>
        <CaretRight size={16} className="mpp-crumb-caret" />
        <span className="mpp-crumb-current">Community snapshot</span>
      </div>
      <DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={(d) => { setRange(d); setCustom(null) }} onSelectRange={(from, to) => setCustom({ from, to })} />
    </div>
    <div className="snapshot-stack">
      <Card className="snapshot-card">
        <CardTitle title="Total members" />
        <div className="snapshot-stats">
          <h2>{formatNumber(w.totalMembers)}</h2>
          <Change v={w.delta.totalMembers} range={effDays} />
        </div>
        <div className="snapshot-plot snapshot-plot--area">
          <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 0, left: 0, bottom: 8 }}>
            <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
            <XAxis dataKey="label" ticks={tickLabels} interval={0} tickLine={false} axisLine={false} tickMargin={8} height={24} tick={<EdgeTick />} />
            <YAxis tickLine={false} axisLine={false} width={38} domain={[roster.lo, roster.hi]} ticks={roster.ticks} tickFormatter={(v) => formatNumber(v)} />
            <Tooltip content={<SnapshotTooltip />} />
            <Line type="monotone" dataKey="roster" stroke="var(--chart-brand-1)" strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface-primary)', fill: 'var(--chart-brand-1)' }} />
          </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="snapshot-card">
        <CardTitle title="Joined vs left" />
        <div className="snapshot-stats snapshot-stats--flow">
          <span className="snapshot-pair"><b className="joined">{formatNumber(w.joined)}</b><span>Joined</span></span>
          <span className="snapshot-pair"><b className="left">{formatNumber(w.left)}</b><span>Left</span></span>
        </div>
        <div className="snapshot-plot snapshot-plot--bars">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={flow} margin={{ top: 8, right: 0, left: 0, bottom: 8 }} barCategoryGap="23%" stackOffset="sign">
              <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
              <XAxis dataKey="label" ticks={tickLabels} interval={0} tickLine={false} axisLine={false} tickMargin={8} height={24} tick={<EdgeTick />} />
              <YAxis tickLine={false} axisLine={false} width={38} domain={[flowTicks.neg > 0 ? -flowTicks.neg : 0, flowTicks.top]} ticks={flowTicks.ticks} tickFormatter={(v) => formatNumber(v)} />
              <ReferenceLine y={0} stroke="var(--content-tertiary)" strokeWidth={1} />
              <Tooltip content={<FlowTooltip />} cursor={{ fill: 'var(--surface-secondary)' }} />
              <Bar dataKey="joined" stackId="flow" fill="var(--content-positive)" radius={[2, 2, 0, 0]} maxBarSize={20} shape={gapBar('bottom')} />
              <Bar dataKey="negLeft" stackId="flow" fill="var(--chart-negative)" radius={[0, 0, 2, 2]} maxBarSize={20} shape={gapBar('top')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card className="snapshot-card">
        <CardTitle title="Member movement" />
        <div className="move-lists">
          <MoveList title="Joined" tone="joined" rows={movement.joined} empty="No members joined in this period." />
          <MoveList title="Left" tone="left" rows={movement.left} empty="No members left in this period." />
        </div>
      </Card>
    </div>
  </>
}
