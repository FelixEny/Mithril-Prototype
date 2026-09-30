import { useMemo } from 'react'
import { Fire, Info, X } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { Change } from './Change'
import { TierPill } from './TierPill'
import { avatarFor } from '../avatars'
import { activityTiers } from '../analytics'
import { endDate } from '../data'
import { relationships, influenceEngine, INFLUENCE_COMPONENTS, INFLUENCE_DAYS, type RelationshipsData, type StrengthLabel } from '../relationships'

const DAY = 86_400_000

const DOT_CLASS: Record<StrengthLabel, string> = { strong: 's', mid: 'm', weak: 'w' }
const STRENGTH_TEXT: Record<StrengthLabel, string> = { strong: 'Strong', mid: 'Moderate', weak: 'Weak' }

export function MemberPopup({ data, id, onClose }: { data: RelationshipsData; id: string; onClose: () => void }) {
  const info = data.memberInfo.get(id)
  // Influence Score is pinned to the shared 28-day engine so the popup agrees
  // with the People table and the Top influencers card. Fall back to the
  // windowed value only when the member has no edges in the trailing 28 days.
  const sharedInfo = influenceEngine().memberInfo.get(id) ?? null
  const prevInfluence = useMemo(() => {
    if (!info) return Number.NaN
    if (sharedInfo) {
      const end = endDate.getTime()
      const prev = relationships(end - 2 * INFLUENCE_DAYS * DAY, end - INFLUENCE_DAYS * DAY)
      return prev.memberInfo.get(id)?.influence ?? Number.NaN
    }
    const len = data.end - data.start
    const prev = relationships(data.start - len, data.start)
    return prev.memberInfo.get(id)?.influence ?? Number.NaN
  }, [data, id, info, sharedInfo])
  // Top connections are ranked by relationship strength across the visible graph
  // window, so they agree with the Relationship mix bar directly above them.
  const topConnections = useMemo(() => {
    const rows: { id: string; score: number; label: StrengthLabel }[] = []
    for (const e of data.edges) {
      if (e.a === id) rows.push({ id: e.b, score: e.score, label: e.label })
      else if (e.b === id) rows.push({ id: e.a, score: e.score, label: e.label })
    }
    rows.sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1))
    return rows.slice(0, 3)
  }, [data, id])
  if (!info) return null

  const windowDays = Math.max(1, Math.round((data.end - data.start) / DAY))
  const rangeDays = sharedInfo ? INFLUENCE_DAYS : windowDays
  const influence = sharedInfo ? sharedInfo.influence : info.influence
  const influenceDelta = Number.isFinite(prevInfluence) ? influence - prevInfluence : influence
  const mixTotal = info.mix.strong + info.mix.mid + info.mix.weak
  const pct = (n: number) => (mixTotal > 0 ? Math.round((n / mixTotal) * 100) : 0)
  // Decompose the score using the same engine entry the headline reads, so the
  // contributions always sum to the number shown above them.
  const source = sharedInfo ?? info
  const parts = INFLUENCE_COMPONENTS.map((c) => ({
    ...c,
    points: c.weight * source[c.key],
    max: c.weight * 100,
  }))
  const hasSignal = parts.some((c) => c.points > 0)
  const handle = info.name.toLowerCase().replace(/[\s.]+/g, '_')
  const tier = activityTiers(new Date(data.end)).get(info.memberId) ?? 'Inactive'

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
      <div className="mp-body">
        <div className="mp-stats">
          <div className="mp-stat"><span className="mp-stat-label">Activity level</span><span className="mp-stat-value"><TierPill tier={tier} /></span></div>
          <div className="mp-stat"><span className="mp-stat-label">Cluster</span><span className="mp-stat-value">{info.clusterId >= 0 ? `Cluster ${info.clusterId + 1}` : '—'}</span></div>
        </div>
        <div className="mp-influence">
          <div className="mp-section-head"><span className="mp-section-label"><Fire size={16} />Influence score</span></div>
          <div className="mp-influence-stats"><b className="mp-influence-num">{Math.round(influence)}</b><span className="mp-influence-den">/100</span><Change v={influenceDelta} range={rangeDays} unit="pts" /></div>
          <div className="mp-break-bar">
            {parts.map((c) => <i key={c.key} className={c.key} style={{ width: `${c.points}%` }} />)}
          </div>
          {hasSignal
            ? parts.map((c) => (
                <div className="mp-break-row" key={c.key}>
                  <i className={`dot ${c.key}`} />{c.label}
                  <span className="mp-break-count"><b>{Math.round(c.points)}</b>/{Math.round(c.max)}</span>
                </div>
              ))
            : <div className="mp-break-empty">No scored activity in the last 28 days.</div>}
        </div>
        <div className="mp-mix">
          <div className="mp-section-head"><span>Relationship mix</span><Info size={16} /></div>
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
        <div className="mp-conn">
          <div className="mp-section-head"><span>Top connections</span></div>
          {topConnections.length > 0
            ? topConnections.map((c) => (
                <div className="mp-conn-row" key={c.id}>
                  <i className={`dot ${DOT_CLASS[c.label]}`} />
                  <Avatar spec={avatarFor(c.id)} name={data.memberInfo.get(c.id)?.name ?? c.id} size={24} />
                  <span className="mp-conn-name">{data.memberInfo.get(c.id)?.name ?? c.id}</span>
                  <span className="mp-conn-label">{STRENGTH_TEXT[c.label]}</span>
                </div>
              ))
            : <div className="mp-conn-empty">No connections in this period.</div>}
        </div>
      </div>
    </div>
  )
}