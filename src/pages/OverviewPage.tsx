import { useMemo } from 'react'
import { CaretDown, CaretUp } from '@phosphor-icons/react'
import { formatNumber } from '../analytics'
import { community, endDate } from '../data'
import { metricInfo } from '../help'
import { Stat } from '../components/Stat'
import { CardTitle } from '../components/CardTitle'
import { PageHeader } from '../components/PageHeader'
import { DateRangePicker } from '../components/DateRangePicker'
import { Card } from '../components/Card'
import { FINDING_WINDOW_DAYS, greeting, MIN_ABS_NET, MIN_SHARE, overviewWindow, type OverviewFinding } from '../overview'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000
const monthDay = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function OverviewPage({ range, custom, onSelectPreset, onSelectRange }: RangeProps) {
  const o = useMemo(
    () => custom ? overviewWindow(custom.from, custom.to) : overviewWindow(new Date(endDate.getTime() - range * DAY), new Date(endDate.getTime())),
    [range, custom],
  )
  const { window: w, story } = o
  const netPositive = o.net >= 0
  return <>
    <PageHeader title="Overview" subtitle="Understand the overall health of your community" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />} />

    <Card className="overview-hero">
      <p className="overview-greeting">{greeting(new Date())}</p>
      <h2 className="overview-headline">{story.headline}</h2>
      <p className="overview-detail">{story.detail}</p>
    </Card>

    <Card className="metrics overview-metrics">
      <CardTitle title="Membership" className="metrics-title" />
      <div className="metric-row">
        <div className="metric">
          <Stat layout="below" label="Total members" info={metricInfo['Total members']} value={formatNumber(o.total)} />
        </div>
        <div className="metric">
          <Stat layout="below" label="New members" info={metricInfo['New members']} value={formatNumber(o.newMembers)} />
        </div>
        <div className="metric">
          <Stat layout="below" label="Members who left" info={metricInfo['Members who left']} value={formatNumber(o.leftMembers)} />
        </div>
        <div className="metric">
          <Stat layout="below" label="Net change" info={metricInfo['Net change']} value={<>{netPositive ? '+' : ''}{formatNumber(o.net)}</>} change={{ v: o.net, range: w.days, caption: `over ${w.days}d` }} />
        </div>
      </div>
    </Card>

    <Card className="overview-findings">
      <CardTitle title="Worth a look" />
      {o.findings.length === 0
        ? <p className="overview-empty">Nothing here needs your attention this week. A segment has to move by at least {MIN_ABS_NET} members <em>and</em> {MIN_SHARE * 100}% of its size over {FINDING_WINDOW_DAYS} days before it shows up.</p>
        : <div className="finding-list">{o.findings.map((f) => <Finding key={f.id} f={f} />)}</div>}
    </Card>

    <p className="overview-footnote">
      {community.name} · {formatNumber(o.activeMembers)} of {formatNumber(o.total)} members ({Math.round(o.participationRate)}%) took part in the last {w.days} days, as of {monthDay(w.end)}.
    </p>
  </>
}

function Finding({ f }: { f: OverviewFinding }) {
  const growing = f.kind === 'growing'
  return <div className="finding">
    <span className={`finding-icon ${f.kind}`}>{growing ? <CaretUp weight="fill" size={16} /> : <CaretDown weight="fill" size={16} />}</span>
    <div className="finding-body">
      <p className="finding-title"><b>{f.segmentName}</b> {growing ? 'is growing' : 'is shrinking'}</p>
      <p className="finding-detail"><b>{f.joined}</b> joined and <b>{f.left}</b> left over {FINDING_WINDOW_DAYS} days — a net of <b>{growing ? '+' : ''}{f.net}</b>, or {Math.round(f.share * 100)}% of the {formatNumber(f.size)} members in this segment.</p>
    </div>
  </div>
}