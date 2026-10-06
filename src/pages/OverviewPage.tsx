import { useMemo } from 'react'
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
import { PageHeader } from '../components/PageHeader'
import { Stat } from '../components/Stat'
import { strengthDimensions, StrengthCard } from '../components/StrengthCard'
import { strengthSnapshot, STRENGTH_BASIS_DAYS } from '../relationships'
import { TierDonut } from '../components/TierDonut'
import type { PageKey } from '../components/Sidebar'
import { greeting, overviewStory } from '../overview'
import { overviewInsights } from '../overview-insights'
import { buildMithrilFeed, type FeedIcon } from '../overview-feed'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000

const FEED_ICONS: Record<FeedIcon, typeof Gauge> = { gauge: Gauge, speaker: SpeakerHigh, lightning: Lightning, hash: Hash }

// `onNavigate` is declared here rather than on `RangeProps`: that contract is
// about the date range, and the insight links are the only thing on this page that
// navigates, so the other four pages should not have to accept the prop.
export function OverviewPage({ range, custom, onSelectPreset, onSelectRange, onNavigate }: RangeProps & { onNavigate: (page: PageKey) => void }) {
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range

  const { w, rel, strength, story, insights, feed } = useMemo(() => {
    const w = custom ? dashboardWindow(custom.from, custom.to) : dashboard(range)
    const rel = relationships(w.start.getTime(), w.end.getTime())
    return {
      w,
      rel,
      // Deliberately its own fixed basis window rather than `w`: the score is
      // calibrated for one length, so the picker's length must not reach it. Only
      // a custom end date moves it, which is a real equal-length comparison.
      strength: strengthSnapshot(w.end.getTime()),
      story: overviewStory(w),
      insights: overviewInsights(w),
      // The network engine is already running for the strength card directly above,
      // so the connectedness figure the feed quotes is read off that same result
      // rather than costing a second pass.
      feed: buildMithrilFeed(w, { count: rel.connectedCount, total: w.totalMembers }),
    }
  }, [range, custom])

  // Read once at render time, so the band the visitor first sees is the band
  // that stays for the session rather than ticking over while the page is open.
  const h = greeting(new Date())

  return <>
    <PageHeader title={<>{h.text}<span className="greeting-emoji" aria-hidden="true">{h.emoji}</span></>} headerClassName="header-greeting" titleClassName="greeting-title" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange}/>}/>
    <p className="lead-story">{story.runs.map((r, i) => r.strong ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>)}</p>
    <div className="core-grid">
      {/* `footer` is `Stat`'s optional supporting line. Each footer states a ratio, so
          the figure under the value is a different one from the headline rather
          than a restatement of it. The period-over-period comparison is left to the
          `Change` chip beside the value, not repeated here. */}
      <Card className="detail"><Stat label="Total members" info={metricInfo['Total members']} value={formatNumber(w.totalMembers)} change={{ v: w.delta.totalMembers, range: effDays }} footer={<><b>{formatNumber(w.joined)}</b> of <b>{formatNumber(w.roster.inWindow)}</b> members joined during this period.</>}/></Card>
      <Card className="detail"><Stat label="Active members" info={metricInfo['Active members']} value={formatNumber(w.current.active)} change={{ v: w.delta.active, range: effDays }} footer={<><b>{Math.round(w.current.activeRate)}%</b> of <b>{formatNumber(w.roster.inWindow)}</b> members participated in the last {effDays} day period.</>}/></Card>
      <Card className="detail"><Stat label="New members" info={metricInfo['New members']} value={formatNumber(w.joined)} change={{ v: w.delta.joined, range: effDays }} footer={<><b>{formatNumber(w.activation.activated)}</b> of <b>{formatNumber(w.activation.eligible)}</b> new members activated within 7 days.</>}/></Card>
      <Card className="detail"><Stat label="Server leaves" info={metricInfo['Members who left']} value={formatNumber(w.left)} change={{ v: w.delta.left, range: effDays, invert: true }} footer={<><b>{formatNumber(w.left)}</b> of <b>{formatNumber(w.roster.inWindow)}</b> members present during this period left the server.</>}/></Card>
    </div>
    <StrengthCard score={Math.round(strength.strength)} delta={strength.strengthDelta} range={STRENGTH_BASIS_DAYS} dimensions={strengthDimensions(strength)} showFoot={false}/>
    <Card className="insights-card">
      <CardTitle title="Community insights"/>
      <div className="insights-panel"><div className="insights-grid">
        {insights.map((i) => <CommunityInsight key={i.id} {...i} onNavigate={onNavigate}/>)}
      </div></div>
    </Card>
    <div className="bottom-grid">
      <Card><CardTitle title="Activity tier distribution" meta="Trailing 28 days"/><TierDonut tiers={w.tiers}/></Card>
      <Card><CardTitle title="Mithril feed"/><div className="feed">
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