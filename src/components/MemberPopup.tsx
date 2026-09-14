import { useMemo } from 'react'
import { X } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { Change } from './Change'
import { avatarFor } from '../avatars'
import { activityTiers, TIER_COLORS } from '../analytics'
import { relationships, type RelationshipsData } from '../relationships'

const DAY = 86_400_000

const fmtDate = (t: number) => {
  const d = new Date(t)
  const day = d.toLocaleDateString('en-GB', { day: 'numeric' })
  const month = d.toLocaleDateString('en-GB', { month: 'short' })
  const year = d.toLocaleDateString('en-GB', { year: 'numeric' })
  return `${day} ${month}, ${year}`
}

export function MemberPopup({ data, id, onClose }: { data: RelationshipsData; id: string; onClose: () => void }) {
  const info = data.memberInfo.get(id)
  const prevInfluence = useMemo(() => {
    if (!info) return Number.NaN
    const len = data.end - data.start
    const prev = relationships(data.start - len, data.start)
    return prev.memberInfo.get(id)?.influence ?? Number.NaN
  }, [data, id, info])
  if (!info) return null

  const rangeDays = Math.max(1, Math.round((data.end - data.start) / DAY))
  const influenceDelta = Number.isFinite(prevInfluence) ? info.influence - prevInfluence : info.influence
  const mixTotal = info.mix.strong + info.mix.mid + info.mix.weak
  const pct = (n: number) => (mixTotal > 0 ? Math.round((n / mixTotal) * 100) : 0)
  const handle = info.name.toLowerCase().replace(/[\s.]+/g, '_')
  const tier = activityTiers(new Date(data.end)).get(info.memberId) ?? 'Inactive'
  const lastActive = Number.isFinite(info.lastActive)
    ? (() => {
        const days = Math.floor((data.end - info.lastActive) / DAY)
        if (days <= 0) return 'Today'
        if (days === 1) return 'Yesterday'
        return `${days} days ago`
      })()
    : '—'

  return (
    <div className="member-popup" role="dialog" aria-label={`Member details: ${info.name}`}>
      <div className="mp-head">
        <span className="mp-avat"><Avatar spec={avatarFor(id)} name={info.name} size={40} /></span>
        <span className="mp-id">
          <span className="mp-name">{info.name}</span>
          <span className="mp-handle">@{handle}</span>
        </span>
        <button className="mp-close" aria-label="Close member details" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="mp-stats">
        <div className="mp-stat"><span className="mp-stat-label">Total connections</span><span className="mp-stat-value">{info.degree}</span></div>
        <div className="mp-stat"><span className="mp-stat-label">Activity level</span><span className="mp-stat-value" style={{ color: TIER_COLORS[tier] }}>{tier}</span></div>
        <div className="mp-stat"><span className="mp-stat-label">Member since</span><span className="mp-stat-value">{Number.isFinite(info.joinedAt) ? fmtDate(info.joinedAt) : '—'}</span></div>
        <div className="mp-stat"><span className="mp-stat-label">Last activity</span><span className="mp-stat-value">{lastActive}</span></div>
      </div>
      <div className="mp-influence">
        <div className="mp-section-head"><span>Influence score</span><span className="mp-influence-score"><b className="mp-influence-num">{Math.round(info.influence)}</b>/100</span></div>
        <div className="mp-progress"><i style={{ width: `${Math.min(100, Math.max(0, info.influence))}%` }} /></div>
        <Change v={influenceDelta} range={rangeDays} unit="pts" />
      </div>
      <div className="mp-mix">
        <div className="mp-section-head"><span>Relationships mix</span></div>
        <div className="mp-mix-bar">
          <i className="s" style={{ width: `${pct(info.mix.strong)}%` }} />
          <i className="m" style={{ width: `${pct(info.mix.mid)}%` }} />
          <i className="w" style={{ width: `${pct(info.mix.weak)}%` }} />
        </div>
        <div className="mp-mix-rows">
          <div className="mp-mix-row"><i className="dot s" />Strong<span className="mp-mix-count"><b>{info.mix.strong}</b>({pct(info.mix.strong)}%)</span></div>
          <div className="mp-mix-row"><i className="dot m" />Moderate<span className="mp-mix-count"><b>{info.mix.mid}</b>({pct(info.mix.mid)}%)</span></div>
          <div className="mp-mix-row"><i className="dot w" />Weak<span className="mp-mix-count"><b>{info.mix.weak}</b>({pct(info.mix.weak)}%)</span></div>
        </div>
      </div>
    </div>
  )
}