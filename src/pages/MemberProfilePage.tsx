import { useMemo } from 'react'
import { CaretRight, ChatCircleDots, Fire, Hash } from '@phosphor-icons/react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { memberProfile } from '../member-profile'
import { formatNumber } from '../analytics'
import { metricInfo } from '../help'
import { endDate } from '../data'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { DateRangePicker } from '../components/DateRangePicker'
import { CardTitle } from '../components/CardTitle'
import { MetricsCard } from '../components/MetricsCard'
import { TierPill } from '../components/TierPill'
import { Button } from '../components/Button'
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

export function MemberProfilePage({ memberId, onBack, onExplore, range, custom, onSelectPreset, onSelectRange }: RangeProps & { memberId: string; onBack: () => void; onExplore?: () => void }) {
  const data = useMemo(() => {
    const from = custom ? custom.from : new Date(endDate.getTime() - range * DAY)
    return memberProfile(memberId, from, endDate)
  }, [memberId, range, custom])
  const nowMs = endDate.getTime()
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range
  const firstName = data.name.split(' ')[0]

  return <>
    <div className="mpp-header">
      <div className="mpp-crumbs">
        <button type="button" className="mpp-crumb" onClick={onBack}>People</button>
        <CaretRight size={16} className="mpp-crumb-caret" />
        <span className="mpp-crumb-current">{data.name}</span>
      </div>
      <DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />
    </div>

    <div className="mpp-layout">
      <Card className="mpp-profile">
        <div className="mpp-profile-head">
          <div className="mpp-profile-top">
            <Avatar spec={data.avatar} name={data.name} size={80} />
            <span className="mpp-score"><Fire size={16} weight="fill" /><b>{data.influence}</b></span>
          </div>
          <div className="mpp-identity">
            <strong className="mpp-name">{data.name}</strong>
            {data.username && <span className="mpp-username">{data.username}</span>}
          </div>
          <TierPill tier={data.tier} />
        </div>
        <div className="mpp-section">
          <span className="mpp-section-label">Activity</span>
          <div className="mpp-fact"><em>Joined:</em><b>{joinFmt.format(data.joinedAtMs)}</b></div>
          <div className="mpp-fact"><em>Last active:</em><b>{relTime(data.lastActiveAtMs, nowMs)}</b></div>
        </div>
        <div className="mpp-section mpp-section-last">
          <span className="mpp-section-label">Discord roles</span>
          <div className="mpp-roles">
            {data.roles.length === 0
              ? <span className="mpp-roles-empty">No roles</span>
              : data.roles.map((r) => <span className="role-pill" key={r.id}><i className="role-dot" style={{ background: r.color }} />{r.name}</span>)}
          </div>
        </div>
      </Card>

      <div className="mpp-main">
        <MetricsCard title="Engagement depth" className="mpp-depth" stats={[
          { label: 'Active days', info: metricInfo['Active days'], value: `${data.activeDays}/${effDays}`, change: { v: data.activeDaysPct, range: effDays } },
          { label: 'Messages', info: metricInfo['Messages'], value: formatNumber(data.messages), change: { v: data.messagesPct, range: effDays } },
          { label: 'Voice sessions', info: metricInfo['Voice sessions'], value: formatNumber(data.voice) },
        ]} />

        <Card className="mpp-activity">
          <CardTitle title="Activity over time" />
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid horizontal vertical={false} strokeDasharray="4 2" />
                <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-primary)' }} interval={Math.max(0, Math.ceil(data.series.length / 9) - 1)} />
                <YAxis tickLine={false} axisLine={false} width={30} domain={[0, (max: number) => Math.max(max, 1)]} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
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

        <div className="mpp-bottom">
          <Card className="mpp-channels">
            <CardTitle title="Favourite channels" />
            {data.channels.every((c) => c.count === 0)
              ? <div className="mpp-empty"><span className="mpp-empty-icon"><ChatCircleDots size={20} /></span><strong>No activity this period</strong><span>This member hasn't sent any messages in the selected range.</span></div>
              : <>
                  <div className="chan-head"><span className="chan-rank">#</span><span>Channel</span><span>Messages</span></div>
                  {data.channels.map((c, i) => (
                    <div className="chan-row" key={c.id}>
                      <span className="chan-rank">{i + 1}</span>
                      <span className="tag"><Hash size={20} />{c.name}</span>
                      <span className="chan-count">{formatNumber(c.count)}</span>
                    </div>
                  ))}
                </>}
          </Card>
          <Card className="mpp-explore">
            <div className="mpp-explore-inner">
              <div className="mpp-explore-text">
                <h2>Explore {firstName}&rsquo;s connections</h2>
                <p>View their relationship to other members of the community</p>
              </div>
              <Button onClick={onExplore}>Explore relationships</Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  </>
}
