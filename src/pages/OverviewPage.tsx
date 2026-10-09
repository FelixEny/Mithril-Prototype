import { useMemo, useState } from 'react'
import { Gauge, Hash, Lightning, SpeakerHigh } from '@phosphor-icons/react'
import { dashboard, formatNumber, formatPercent } from '../analytics'
import { relationships } from '../relationships'
import { getMemberAvatar } from '../avatars'
import { Avatar } from '../components/Avatar'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { CommunityInsight } from '../components/CommunityInsight'
import { MetricsCard } from '../components/MetricsCard'
import { PageHeader } from '../components/PageHeader'
import { strengthDimensions, StrengthCard } from '../components/StrengthCard'
import { strengthSnapshot, STRENGTH_BASIS_DAYS } from '../relationships'
import { metricInfo } from '../help'
import { TierDonut } from '../components/TierDonut'
import type { PageKey } from '../components/Sidebar'
import { greeting, overviewStory } from '../overview'
import { overviewInsights } from '../overview-insights'
import { buildMithrilFeed, type FeedIcon } from '../overview-feed'
import { CommunitySnapshotPage } from './CommunitySnapshotPage'

const FEED_ICONS: Record<FeedIcon, typeof Gauge> = { gauge: Gauge, speaker: SpeakerHigh, lightning: Lightning, hash: Hash }

export function OverviewPage({ onNavigate }: { onNavigate: (page: PageKey) => void }) {
  const [snapshot, setSnapshot] = useState(false)
  const effDays = STRENGTH_BASIS_DAYS

  // The whole page reads one trailing 28-day window. There is no date picker:
  // the insights, the feed and the strength score are all calibrated for a
  // single length, so the snapshot card sits on the same window rather than a
  // page of otherwise incoherent ranges.
  const { w, rel, strength, story, insights, feed } = useMemo(() => {
    const w = dashboard(STRENGTH_BASIS_DAYS)
    const rel = relationships(w.start.getTime(), w.end.getTime())
    return {
      w,
      rel,
      strength: strengthSnapshot(w.end.getTime()),
      story: overviewStory(w),
      insights: overviewInsights(w),
      // The network engine is already running for the same window the strength
      // card reads, so the connectedness figure the feed quotes is read off that
      // same result rather than costing a second pass.
      feed: buildMithrilFeed(w, { count: rel.connectedCount, total: w.totalMembers }),
    }
  }, [])

  // Read once at render time, so the band the visitor first sees is the band
  // that stays for the session rather than ticking over while the page is open.
  const h = greeting(new Date())

  if (snapshot) return <CommunitySnapshotPage w={w} effDays={effDays} onBack={() => setSnapshot(false)} />

  return <>
    <PageHeader title={<>{h.text}<img className="greeting-emoji" src={`/emoji/${h.emoji}.svg`} alt="" aria-hidden="true" /></>} headerClassName="header-greeting" titleClassName="greeting-title"/>
    <p className="lead-story">{story.runs.map((r, i) => r.strong ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>)}</p>
    {/* The four metrics sit in one card as columns divided by a hairline rather
        than as four cards: the period-over-period `Change` chip beside each value
        is the whole comparison, so nothing is lost by dropping the supporting
        lines the four-card version carried. "Explore" drills into the Community
        snapshot page, which plots the roster and the membership flow across this
        same 28-day window. */}
    <MetricsCard title="Community snapshot" link="Explore" onClick={() => setSnapshot(true)} stats={[
      { label: 'Total members', value: formatNumber(w.totalMembers), change: { v: w.delta.totalMembers, range: effDays } },
      { label: 'New members', value: formatNumber(w.joined), change: { v: w.delta.joined, range: effDays } },
      { label: 'Server leaves', value: formatNumber(w.left), change: { v: w.delta.left, range: effDays, invert: true } },
      { label: 'Active member rate', info: metricInfo['Active member rate'], value: formatPercent(w.current.activeRate), change: { v: w.delta.activeRate, pp: true, range: effDays } },
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