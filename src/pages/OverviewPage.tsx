import { useMemo, useState } from 'react'
import { Gauge, Hash, Lightning, SpeakerHigh } from '@phosphor-icons/react'
import { dashboard, dashboardWindow, formatNumber } from '../analytics'
import { relationships } from '../relationships'
import { endDate } from '../data'
import { getMemberAvatar } from '../avatars'
import { metricInfo } from '../help'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { CommunityInsight } from '../components/CommunityInsight'
import { DateRangePicker } from '../components/DateRangePicker'
import { MetricsCard } from '../components/MetricsCard'
import { PageHeader } from '../components/PageHeader'
import { strengthDimensions, StrengthCard } from '../components/StrengthCard'
import { strengthSnapshot, STRENGTH_BASIS_DAYS } from '../relationships'
import { TierDonut } from '../components/TierDonut'
import type { PageKey } from '../components/Sidebar'
import { greeting, overviewStory } from '../overview'
import { overviewInsights } from '../overview-insights'
import { buildMithrilFeed, type FeedIcon } from '../overview-feed'
import { CommunitySnapshotPage } from './CommunitySnapshotPage'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000

const FEED_ICONS: Record<FeedIcon, typeof Gauge> = { gauge: Gauge, speaker: SpeakerHigh, lightning: Lightning, hash: Hash }

// `onNavigate` is declared here rather than on `RangeProps`: that contract is
// about the date range, and the insight links are the only thing on this page that
// navigates, so the other four pages should not have to accept the prop.
export function OverviewPage({ range, custom, onSelectPreset, onSelectRange, onNavigate }: RangeProps & { onNavigate: (page: PageKey) => void }) {
  const [snapshot, setSnapshot] = useState(false)
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range

  const { w, rel, strength, story, insights, feed } = useMemo(() => {
    const w = custom ? dashboardWindow(custom.from, custom.to) : dashboard(range)
    // Deliberately its own fixed basis window rather than `w`: the insights, the
    // feed and the strength score all read best at one length, so the picker's
    // length must not reach them. Only a custom end date moves them, which is a
    // real equal-length comparison.
    const basis = dashboardWindow(new Date(w.end.getTime() - STRENGTH_BASIS_DAYS * DAY), w.end)
    const rel = relationships(basis.start.getTime(), basis.end.getTime())
    return {
      w,
      rel,
      // On the same fixed basis: the score is calibrated for one length, so the
      // picker's length must not reach the gauge either.
      strength: strengthSnapshot(w.end.getTime()),
      story: overviewStory(w),
      insights: overviewInsights(basis),
      // The network engine is already running for the `basis` window (the same
      // window the strength card reads), so the connectedness figure the feed
      // quotes is read off that same result rather than costing a second pass.
      feed: buildMithrilFeed(basis, { count: rel.connectedCount, total: basis.totalMembers }),
    }
  }, [range, custom])

  // Read once at render time, so the band the visitor first sees is the band
  // that stays for the session rather than ticking over while the page is open.
  const h = greeting(new Date())

  if (snapshot) return <CommunitySnapshotPage w={w} effDays={effDays} range={range} custom={custom} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} onBack={() => setSnapshot(false)} />

  return <>
    <PageHeader title={<>{h.text}<img className="greeting-emoji" src={`/emoji/${h.emoji}.svg`} alt="" aria-hidden="true" /></>} headerClassName="header-greeting" titleClassName="greeting-title" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange}/>}/>
    <p className="lead-story">{story.runs.map((r, i) => r.strong ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>)}</p>
    {/* The four metrics sit in one card as columns divided by a hairline rather
        than as four cards: the period-over-period `Change` chip beside each value
        is the whole comparison, so nothing is lost by dropping the supporting
        lines the four-card version carried. "View chart" drills into the
        Community snapshot page, which plots the roster and the membership flow
        across this same range. */}
    <MetricsCard title="Community snapshot" link="View chart" onClick={() => setSnapshot(true)} stats={[
      { label: 'Total members', value: formatNumber(w.totalMembers), change: { v: w.delta.totalMembers, range: effDays } },
      { label: 'Active members', info: metricInfo['Active members'], value: formatNumber(w.current.active), change: { v: w.delta.active, range: effDays } },
      { label: 'New members', value: formatNumber(w.joined), change: { v: w.delta.joined, range: effDays } },
      { label: 'Server leaves', value: formatNumber(w.left), change: { v: w.delta.left, range: effDays, invert: true } },
    ]}/>
    <Card className="insights-card">
      <CardTitle className="metrics-title" title="Community insights" meta="Trailing 28 days"/>
      <div className="insights-panel"><div className="insights-grid">
        {insights.map((i) => <CommunityInsight key={i.id} {...i} onNavigate={onNavigate}/>)}
      </div></div>
    </Card>
    <StrengthCard score={Math.round(strength.strength)} delta={strength.strengthDelta} range={STRENGTH_BASIS_DAYS} dimensions={strengthDimensions(strength)} showFoot={false}/>
    <div className="bottom-grid">
      <Card><CardTitle title="Activity tier distribution" meta="Trailing 28 days"/><TierDonut tiers={w.tiers}/></Card>
      <Card><CardTitle title="Mithril feed" meta="Trailing 28 days"/><div className="feed">
        {feed.map((f) => { const Icon = FEED_ICONS[f.icon]; return <div className="feed-row" key={f.id}>
          <span className="feed-icon"><Icon size={20}/></span>
          <div className="feed-body">
            <p className="feed-headline"><span>{f.headline}</span>{f.channel && <span className="feed-channel"><Hash size={20}/>{f.channel}</span>}</p>
            <p className="feed-supporting">
              {/* Figma's `Left` group is [avatar stack, supporting text]; the stack
                  leads. It ends in a brand bubble rather than a fourth face, because
                  there is no fourth member to show. */}
              {f.avatars && f.avatars.length > 0 && <span className="feed-avatars avatar-stack">{f.avatars.map((m, i) => <span className="avatar-slot" key={m.id} style={{ zIndex: i }}><Avatar spec={getMemberAvatar(m.id)} name={m.name}/></span>)}{f.avatarCount! > 0 && <em className="feed-avatar-count">+{f.avatarCount}</em>}</span>}
              <span className="feed-detail">{f.supporting}</span>
              {f.timestamp && <span className="feed-time">{f.timestamp}</span>}
            </p>
          </div>
        </div> })}
      </div></Card>
    </div>
  </>
}