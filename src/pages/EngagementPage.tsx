import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDown, ArrowUp, Hash, TrendUp } from '@phosphor-icons/react'
import { activationSeries, clockLabel, dashboard, dashboardWindow, formatNumber, formatPercent, membersToWatch, RangeDays, retentionSeries, type MemberWatchRow, type RetentionPoint } from '../analytics'
import { endDate } from '../data'
import { getMemberAvatar } from '../avatars'
import { Avatar } from '../components/Avatar'
import { DateRangePicker } from '../components/DateRangePicker'
import { metricInfo } from '../help'
import { MetricsCard } from '../components/MetricsCard'
import { Change } from '../components/Change'
import { CardTitle } from '../components/CardTitle'
import { ChartTooltip } from '../components/ChartTooltip'
import { HeatmapCard } from '../components/Heatmap'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { TextLink } from '../components/TextLink'
import { TierPill } from '../components/TierPill'

export interface RangeProps {
  range: RangeDays
  custom: { from: Date; to: Date } | null
  onSelectPreset: (d: RangeDays) => void
  onSelectRange: (from: Date, to: Date) => void
  onOpenWatch?: (watch: MemberWatchRow[]) => void
  peopleWatch?: MemberWatchRow[] | null
  onClearWatch?: () => void
}


const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const NEGLIGIBLE_BAR = 1e-6
const COHORTS = [
  { key: 'all', label: 'All members', color: 'var(--content-brand)' },
  { key: 'new28', label: 'New (<28 days)', color: 'var(--chart-lurker)' },
  { key: 'm30', label: '28–90 days', color: 'var(--chart-contributor)' },
  { key: 'm90', label: '90–180 days', color: 'var(--chart-regular)' },
] as const

function RateTooltip({ active, payload, metric }: { active?: boolean; payload?: Array<{ value: number | null; payload: { date: string; noData?: boolean } }>; metric: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  return <ChartTooltip label={p.payload.date} value={p.payload.noData ? `${metric}: no new members` : `${metric}: ${Math.round(p.value ?? 0)}%`} />
}

function CohortTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RetentionPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <div className="chart-tooltip"><span className="chart-tooltip-label">{p.date}</span>{COHORTS.map(c => <span className="chart-tooltip-row" key={c.key}><i style={{ background: c.color }} />{c.label}<b>{Math.round(p[c.key])}%</b></span>)}</div>
}

export function EngagementPage({ range, custom, onSelectPreset, onSelectRange, onOpenWatch }: RangeProps) {
  const data = useMemo<ReturnType<typeof dashboardWindow> | null>(() => (custom ? dashboardWindow(custom.from, custom.to) : dashboard(range)), [range, custom])
  const d = data!
  const ret = retentionSeries(d.end)
  const actBars = activationSeries(d.end).map(p => ({ ...p, rate: p.rate ? p.rate : NEGLIGIBLE_BAR, noData: p.rate === null }))
  const watch = membersToWatch(d.start, d.end)
  const discussions = d.discussionRows
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / 86400000)) : range
  return <><PageHeader collapsible title="Engagement" subtitle="Understand how members participate in your community" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />} />
  <MetricsCard title="Engagement depth" link="View chart" href="#" stats={[
    { label: 'Messages', info: metricInfo['Messages'], value: formatNumber(d.current.messages), change: { v: d.delta.messages, range: effDays } },
    { label: 'Reply rate', info: metricInfo['Reply rate'], value: formatPercent(d.current.replyRate), change: { v: d.delta.replyRate, pp: true, range: effDays } },
    { label: 'Voice participants', info: metricInfo['Voice participants'], value: formatNumber(d.current.voice), change: { v: d.delta.voice, range: effDays } },
    { label: 'Total voice time', info: metricInfo['Total voice time'], value: `${formatNumber(Math.round(d.current.voiceMinutes / 60))}h`, change: { v: d.delta.voiceMinutes, range: effDays } },
  ]}/>
  <Card className="heat-card">
    <HeatmapCard heat={d.heat} />
    <div className="peak-panel"><div className="peak-title"><h3>Peak activity</h3></div><div className="peak-rows">{d.peaks.map((b, i) => <div className="peak-row" key={i}><div className="peak-info"><span className="peak-day">{DAY_FULL[b.weekday]}</span><span className="peak-window">{clockLabel(b.minHour)}{b.maxHour !== b.minHour ? ` – ${clockLabel(b.maxHour)}` : ''}</span><span className="peak-avg">Avg: {Math.round(b.avgActive)} members – {Math.round(b.avgMessages)} msgs</span></div><div className="peak-scaler"><span className="peak-trend"><TrendUp size={16} />{b.relative.toFixed(1)}×</span><span className="peak-caption">Hourly avg.</span></div></div>)}</div></div>
  </Card>
  <div className="eng-grid">
    <Card><CardTitle title="Retention" info={metricInfo['Retention']} action={<TextLink href="#">Learn more</TextLink>} /><div className="chart-stat"><h2>{formatPercent(d.current.retention)}</h2><Change v={d.delta.retention} pp caption="vs prior 28D" range={28} /></div><div className="chart-box"><div className="chart eng-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={ret} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}><CartesianGrid horizontal vertical={false} strokeDasharray="4 2" /><XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} interval={0} /><YAxis tickLine={false} axisLine={false} width={36} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} /><Tooltip content={<CohortTooltip />} />{COHORTS.map(c => <Line key={c.key} type="linear" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer></div></div><div className="ret-legend">{COHORTS.map(c => <span className="ret-legend-item" key={c.key}><i style={{ background: c.color }} />{c.label}</span>)}</div></Card>
    <Card><CardTitle title="New member activation" info={metricInfo['New member activation']} /><div className="chart-stat"><h2>{formatPercent(d.current.activation)}</h2><Change v={d.delta.activation} pp range={effDays} /></div><div className="chart-box act-chart-box"><div className="chart eng-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={actBars} layout="vertical" margin={{ top: 8, right: 12, left: 0, bottom: 4 }} barCategoryGap="30%"><CartesianGrid horizontal={false} vertical strokeDasharray="4 2" /><XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} tickFormatter={(v) => `${v}%`} /><YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={112} interval={0} /><Tooltip content={<RateTooltip metric="Activation" />} cursor={{ fill: 'var(--surface-tertiary)', stroke: 'none' }} /><Bar dataKey="rate" name="Activation" fill="var(--content-brand)" radius={[0, 4, 4, 0]} background={{ fill: 'var(--surface-tertiary)', radius: 4 }} /></BarChart></ResponsiveContainer></div></div></Card>
  </div>
  <div className="eng-grid">
    <Card><CardTitle title="Engagement by channel" /><div className="chan-head"><span className="chan-rank">#</span><span>Channel</span><span>Active members</span><span>Messages</span></div>{d.channelRows.slice(0, 5).map((r, i) => <div className="chan-row" key={r.id}><span className="chan-rank">{i + 1}</span><span className="tag"><Hash size={20} />{r.name}</span><span className="chan-count">{formatNumber(r.active)}</span><span className="chan-count">{formatNumber(r.messages)}</span></div>)}</Card>
    <Card><CardTitle title="Members to watch" info={metricInfo['Members to watch']} action={<TextLink onClick={() => onOpenWatch?.(watch)}>View in people</TextLink>} /><div className="watch-head"><span>Member</span><span>Change</span></div>{watch.map(w => <div className="watch-row" key={w.id}><span className="watch-member"><span className="watch-avatar"><Avatar spec={getMemberAvatar(w.id)} name={w.name} size={32} /></span><span className="watch-meta"><b>{w.name}</b><em>{w.handle}</em></span></span><span className="watch-activity"><span className={`watch-dir ${w.direction}`}>{w.direction === 'up' ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}</span>{w.kind === 'tier' && w.from && w.to ? <span className="watch-change">Moved from <TierPill tier={w.from} /> to <TierPill tier={w.to} /></span> : <span className="watch-change">{w.text}</span>}</span></div>)}</Card>
  </div>
  <Card className="trend-card"><CardTitle title="Trending discussions" /><div className="discussion-head"><span>Channel</span><span>Conversation</span></div>{discussions.slice(0, 4).map(x => <div className="discussion" key={x.id}><span className="tag"><Hash size={20} />{x.channel}</span><div><p>{x.text}</p><div className="discussion-meta"><span className="meta-avatars"><span className="avatar-stack" title={`${x.participants} participants`}>{x.avatars.slice(0, 3).map((m, i) => <span className="avatar-slot" key={m.id} style={{ zIndex: i }}><Avatar spec={getMemberAvatar(m.id)} name={m.name} /></span>)}</span>{x.participants > 3 && <em className="avatar-others">+{x.participants - 3} others</em>}</span><span className="stat"><b>{formatNumber(x.replies)}</b> Replies</span><span className="stat"><b>{formatNumber(x.reactions)}</b> Reactions</span><strong><TrendUp size={12} />{x.score.toFixed(1)}×<small> usual activity</small></strong></div></div></div>)}</Card>
  </>
}