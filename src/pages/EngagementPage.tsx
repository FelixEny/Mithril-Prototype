import { useMemo, useRef, useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Hash, TrendUp } from '@phosphor-icons/react'
import { activationSeries, clockLabel, dashboard, dashboardWindow, formatNumber, formatPercent, heatActiveLevel, heatLevel, membersToWatch, RangeDays, retentionSeries, type RetentionPoint } from '../analytics'
import { endDate } from '../data'
import { getMemberAvatar } from '../avatars'
import { Avatar } from '../components/Avatar'
import { DateRangePicker } from '../components/DateRangePicker'
import { metricInfo } from '../help'
import { MetricsCard } from '../components/MetricsCard'
import { Change } from '../components/Change'
import { Tabs } from '../components/Tabs'
import { CardTitle } from '../components/CardTitle'
import { ChartTooltip } from '../components/ChartTooltip'
import { PageHeader } from '../components/PageHeader'
import { Card } from '../components/Card'
import { TextLink } from '../components/TextLink'

export interface RangeProps {
  range: RangeDays
  custom: { from: Date; to: Date } | null
  onSelectPreset: (d: RangeDays) => void
  onSelectRange: (from: Date, to: Date) => void
}


const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const dayLabels = ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun']
const COHORTS = [
  { key: 'all', label: 'All members', color: 'var(--content-brand)' },
  { key: 'new28', label: 'New (28 days)', color: 'var(--chart-lurker)' },
  { key: 'm30', label: '30 - 90 days', color: 'var(--chart-contributor)' },
  { key: 'm90', label: '90 - 180 days', color: 'var(--chart-regular)' },
] as const

function RateTooltip({ active, payload, metric }: { active?: boolean; payload?: Array<{ value: number; payload: { date: string } }>; metric: string }) {
  if (!active || !payload?.length) return null
  return <ChartTooltip label={payload[0].payload.date} value={`${metric}: ${Math.round(payload[0].value)}%`} />
}

function CohortTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: RetentionPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <div className="chart-tooltip"><span className="chart-tooltip-label">{p.date}</span>{COHORTS.map(c => <span className="chart-tooltip-row" key={c.key}><i style={{ background: c.color }} />{c.label}<b>{Math.round(p[c.key])}%</b></span>)}</div>
}

export function EngagementPage({ range, custom, onSelectPreset, onSelectRange }: RangeProps) {
  const [heatMetric, setHeatMetric] = useState('Messages')
  const [hover, setHover] = useState<{ weekday: number; hour: number; count: number; x: number; y: number } | null>(null)
  const heatRef = useRef<HTMLDivElement>(null)
  const hourLabel = (h: number) => h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`
  const heatMove = (e: React.MouseEvent, cell: { weekday: number; hour: number; count: number }) => { const r = heatRef.current?.getBoundingClientRect(); if (!r) return; setHover({ ...cell, x: e.clientX - r.left, y: e.clientY - r.top }) }
  const data = useMemo<ReturnType<typeof dashboardWindow> | null>(() => (custom ? dashboardWindow(custom.from, custom.to) : dashboard(range)), [range, custom])
  const d = data!
  const ret = retentionSeries(d.end)
  const act = activationSeries(d.end)
  const watch = membersToWatch(d.end)
  const discussions = d.discussionRows
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / 86400000)) : range
  return <><PageHeader title="Engagement" subtitle="Understand how members participate in your community" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />} />
  <MetricsCard title="Engagement depth" link="View chart" href="#" stats={[
    { label: 'Messages', info: metricInfo['Messages'], value: formatNumber(d.current.messages), change: { v: d.delta.messages, range: effDays } },
    { label: 'Reply rate', info: metricInfo['Reply rate'], value: formatPercent(d.current.replyRate), change: { v: d.delta.replyRate, pp: true, range: effDays } },
    { label: 'Voice participants', info: metricInfo['Voice participants'], value: formatNumber(d.current.voice), change: { v: d.delta.voice, range: effDays } },
    { label: 'Total voice time', info: metricInfo['Total voice time'], value: `${formatNumber(Math.round(d.current.voiceMinutes / 60))}h`, change: { v: d.delta.voiceMinutes, range: effDays } },
  ]}/>
  <Card className="heat-card">
    <div className="heat-main"><CardTitle title="Activity by day and time" action={<Tabs values={['Messages', 'Active members']} value={heatMetric} onChange={setHeatMetric} />} /><div className="heat" ref={heatRef}><div className="y-labels">{dayLabels.map(x => <span key={x}>{x}</span>)}</div><div className="cells">{(heatMetric === 'Messages' ? d.heat : d.heatActive).flat().map(cell => { const level = heatMetric === 'Messages' ? heatLevel(cell.count) : heatActiveLevel(cell.count); return <button type="button" key={`${cell.weekday}-${cell.hour}`} style={{ background: `var(--heat-${level})` }} aria-label={`${dayLabels[cell.weekday]} ${hourLabel(cell.hour)}: ${formatNumber(cell.count)} ${heatMetric === 'Messages' ? 'messages' : 'active members'}`} onMouseEnter={(e) => heatMove(e, cell)} onMouseMove={(e) => heatMove(e, cell)} onMouseLeave={() => setHover(null)} /> })}<div className="hours">{Array.from({ length: 12 }, (_, i) => <span key={i}>{hourLabel(i * 2)}</span>)}</div></div>{hover && <span className="heat-tooltip" style={{ left: Math.max(76, Math.min(hover.x, (heatRef.current?.offsetWidth ?? 900) - 76)), top: hover.y, transform: hover.y > 44 ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 12px)' }}><ChartTooltip label={`${dayLabels[hover.weekday]} - ${hourLabel(hover.hour)}`} value={heatMetric === 'Messages' ? `Avg messages: ${formatNumber(hover.count)}` : `Avg active: ${formatNumber(hover.count)}`} /></span>}</div><div className="heat-footer"><div className="activity-legend"><span>Less activity</span><span className="heat-scale"><i /><i /><i /><i /><i /><i /><i /></span><span>More activity</span></div></div></div>
    <div className="peak-panel"><div className="peak-title"><h3>Peak activity time</h3></div><div className="peak-rows">{d.peaks.map((b, i) => <div className="peak-row" key={i}><div className="peak-info"><span className="peak-day">{DAY_FULL[b.weekday]}</span><span className="peak-window">{clockLabel(b.minHour)}{b.maxHour !== b.minHour ? ` – ${clockLabel(b.maxHour)}` : ''}</span><span className="peak-avg">Avg. {Math.max(1, Math.round(b.avg))} Messages</span></div><div className="peak-scaler"><span className="peak-trend"><TrendUp size={16} />{b.magnitude.toFixed(1)}×</span><span className="peak-caption">Hourly avg.</span></div></div>)}</div></div>
  </Card>
  <div className="eng-grid">
    <Card><CardTitle title="Retention" info={metricInfo['Retention']} action={<TextLink href="#">Learn more</TextLink>} /><div className="chart-stat"><h2>{formatPercent(d.current.retention)}</h2><Change v={d.delta.retention} range={effDays} caption="vs last 28D" /></div><div className="chart-box"><div className="chart eng-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={ret} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}><CartesianGrid horizontal vertical={false} strokeDasharray="4 2" /><XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} interval={0} /><YAxis tickLine={false} axisLine={false} width={36} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} /><Tooltip content={<CohortTooltip />} />{COHORTS.map(c => <Line key={c.key} type="linear" dataKey={c.key} name={c.label} stroke={c.color} strokeWidth={2} dot={false} />)}</LineChart></ResponsiveContainer></div></div><div className="ret-legend">{COHORTS.map(c => <span className="ret-legend-item" key={c.key}><i style={{ background: c.color }} />{c.label}</span>)}</div></Card>
    <Card><CardTitle title="New member activation" info={metricInfo['New member activation']} /><div className="chart-stat"><h2>{formatPercent(d.current.activation)}</h2><Change v={d.delta.activation} range={effDays} caption="vs last 28D" /></div><div className="chart-box"><div className="chart eng-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={act} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}><CartesianGrid horizontal vertical={false} strokeDasharray="4 2" /><XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} interval={0} /><YAxis tickLine={false} axisLine={false} width={36} domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} /><Tooltip content={<RateTooltip metric="Activation" />} /><Line type="linear" dataKey="rate" stroke="var(--content-brand)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></div></div></Card>
  </div>
  <div className="eng-grid">
    <Card><CardTitle title="Engagement by channel" /><div className="chan-head"><span className="chan-rank">#</span><span>Channel</span><span>Active members</span><span>Messages</span></div>{d.channelRows.slice(0, 5).map((r, i) => <div className="chan-row" key={r.id}><span className="chan-rank">{i + 1}</span><span className="tag"><Hash size={20} />{r.name}</span><span className="chan-count">{formatNumber(r.active)}</span><span className="chan-count">{formatNumber(r.messages)}</span></div>)}</Card>
    <Card><CardTitle title="Members to watch" /><div className="watch-head"><span>Member</span><span>Activity</span></div>{watch.map(w => <div className="watch-row" key={w.id}><span className="watch-member"><span className="watch-avatar"><Avatar spec={getMemberAvatar(w.id)} name={w.name} size={32} /></span><span className="watch-meta"><b>{w.name}</b><em>{w.handle}</em></span></span><span className="watch-activity">{w.blurb}</span></div>)}</Card>
  </div>
  <Card className="trend-card"><CardTitle title="Trending discussions" /><div className="discussion-head"><span>Channel</span><span>Conversation</span></div>{discussions.slice(0, 4).map(x => <div className="discussion" key={x.id}><span className="tag"><Hash size={20} />{x.channel}</span><div><p>{x.text}</p><div className="discussion-meta"><span className="meta-avatars"><span className="avatar-stack" title={`${x.participants} participants`}>{x.avatars.slice(0, 3).map((m, i) => <span className="avatar-slot" key={m.id} style={{ zIndex: i }}><Avatar spec={getMemberAvatar(m.id)} name={m.name} /></span>)}</span>{x.participants > 3 && <em className="avatar-others">+{x.participants - 3} others</em>}</span><span className="stat"><b>{formatNumber(x.replies)}</b> Replies</span><span className="stat"><b>{formatNumber(x.reactions)}</b> Reactions</span><strong><TrendUp size={12} />{x.score.toFixed(1)}×<small> usual activity</small></strong></div></div></div>)}</Card>
  </>
}