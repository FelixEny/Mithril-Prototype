import { useMemo } from 'react'
import { CaretRight, ChatCircleDots, Hash, Info } from '@phosphor-icons/react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { memberProfile } from '../member-profile'
import { formatNumber } from '../analytics'
import { metricInfo } from '../help'
import { endDate } from '../data'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { DateRangePicker } from '../components/DateRangePicker'
import { CardTitle } from '../components/CardTitle'
import { Change } from '../components/Change'
import { TierPill } from '../components/TierPill'
import { SparkBars } from '../components/SparkBars'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000
const joinFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const relTime = (ms: number, nowMs: number) => {
  if (ms === -Infinity) return '—'
  const d = Math.floor((nowMs - ms) / DAY)
  return d <= 0 ? 'Today' : `${d} day${d === 1 ? '' : 's'} ago`
}

function ActivityTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { date: string; messages: number; reactions: number } }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return <div className="chart-tooltip"><span className="chart-tooltip-label">{p.date}</span><span className="chart-tooltip-value">Messages: {formatNumber(p.messages)}</span><span className="chart-tooltip-value">Reactions: {formatNumber(p.reactions)}</span></div>
}

export function MemberProfilePage({ memberId, onBack, range, custom, onSelectPreset, onSelectRange }: RangeProps & { memberId: string; onBack: () => void }) {
  const data = useMemo(() => {
    const from = custom ? custom.from : new Date(endDate.getTime() - range * DAY)
    return memberProfile(memberId, from, endDate)
  }, [memberId, range, custom])
  const nowMs = endDate.getTime()
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range

  return <>
    <div className="mpp-header">
      <div className="mpp-crumbs">
        <button type="button" className="mpp-crumb" onClick={onBack}>People</button>
        <CaretRight size={16} className="mpp-crumb-caret" />
        <span className="mpp-crumb-current">{data.name}</span>
      </div>
      <DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />
    </div>

    <div className="mpp-hero">
      <Avatar spec={data.avatar} name={data.name} size={88} />
      <div className="mpp-hero-info">
        <div className="mpp-name-row">
          <h1 className="mpp-name">{data.name}</h1>
          {data.username && <span className="mpp-username">@{data.username}</span>}
        </div>
        <div className="mpp-tags">
          <TierPill tier={data.tier} />
          {data.roles.map((r) => <span className="role-pill" key={r.id}><i className="role-dot" style={{ background: r.color }} />{r.name}</span>)}
        </div>
        <div className="mpp-meta">
          <span className="mpp-meta-item"><em>Joined:</em><b>{joinFmt.format(data.joinedAtMs)}</b></span>
          <i className="mpp-meta-sep" />
          <span className="mpp-meta-item"><em>First active:</em><b>{data.firstActiveAtMs === -Infinity ? '—' : joinFmt.format(data.firstActiveAtMs)}</b></span>
          <i className="mpp-meta-sep" />
          <span className="mpp-meta-item"><em>Last active:</em><b>{relTime(data.lastActiveAtMs, nowMs)}</b></span>
        </div>
      </div>
    </div>

    <div className="mpp-stats">
      <div className="mpp-influence">
        <div className="mpp-stat-head"><span>Influence score</span><span className="info-tip" tabIndex={0} role="note" aria-label="What does this mean?"><Info size={16} /><span className="tip" role="tooltip"><span className="tip-title">What does this mean?</span><span className="tip-body">{metricInfo['Influence score']}</span></span></span></div>
        <div className="mpp-stat-value"><h2>{data.influence}</h2><span className="mpp-of">/100</span><Change v={data.influenceDelta} unit="pts" range={effDays} /></div>
        <div className="mpp-bar"><i style={{ width: `${Math.max(0, Math.min(100, data.influence))}%` }} /></div>
      </div>
      <div className="mpp-stat-card">
        <div className="mpp-stat-head"><span>Active days</span></div>
        <div className="mpp-stat-value"><h2>{data.activeDays}</h2><span className="mpp-of">/{effDays}</span><Change v={data.activeDaysPct} range={effDays} /></div>
        <div className="mpp-bar green"><i style={{ width: `${effDays ? Math.max(0, Math.min(100, (data.activeDays / effDays) * 100)) : 0}%` }} /></div>
      </div>
      <div className="mpp-stat-card">
        <div className="mpp-stat-head"><span>Messages</span></div>
        <div className="mpp-stat-row">
          <div className="mpp-stat-value"><h2>{formatNumber(data.messages)}</h2><Change v={data.messagesPct} range={effDays} /></div>
          <SparkBars bars={data.msgBars} />
        </div>
      </div>
      <div className="mpp-stat-card">
        <div className="mpp-stat-head"><span>Voice sessions</span></div>
        <div className="mpp-stat-row">
          <div className="mpp-stat-value"><h2>{formatNumber(data.voice)}</h2><Change v={data.voicePct} range={effDays} /></div>
          <SparkBars bars={data.voiceBars} gray />
        </div>
      </div>
    </div>

    <div className="mpp-grid">
      <Card className="mpp-activity"><CardTitle title="Activity over time" />
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series}>
              <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} interval={Math.max(0, Math.ceil(data.series.length / 9) - 1)} />
              <YAxis tickLine={false} axisLine={false} width={30} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
              <Tooltip content={<ActivityTooltip />} />
              <Line type="linear" dataKey="messages" stroke="var(--content-brand)" strokeWidth={2} dot={false} />
              <Line type="linear" dataKey="reactions" stroke="var(--content-warning)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="mpp-legend">
          <span><i />Messages</span>
          <span><i className="amber" />Reactions</span>
        </div>
      </Card>

      <Card className="mpp-channels">
        <CardTitle title="Most active channels" />
        {data.channels.every((c) => c.count === 0)
          ? <div className="mpp-empty"><span className="mpp-empty-icon"><ChatCircleDots size={20} /></span><strong>No activity this period</strong><span>This member hasn't sent any messages in the selected range.</span></div>
          : <>
              <div className="mpp-head"><span>Channel name</span><span>No. of Messages</span></div>
              {data.channels.map((c) => (
                <div className="channel-row" key={c.id}>
                  <span className="channel-stats">
                    <span className="channel-name"><Hash size={20} />{c.name}</span>
                    <span className="channel-bar-row">
                      <span className="bar"><i style={{ width: `${c.pct}%` }} /></span>
                      <span className="channel-count">{formatNumber(c.count)}</span>
                    </span>
                  </span>
                </div>
              ))}
            </>}
      </Card>
    </div>
  </>
}