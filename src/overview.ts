import { formatNumber, membershipSeries, type DashboardWindow, type MembershipPoint } from './analytics'
import { allSegments, segmentFlow, segmentMembership } from './segments'
import { endDate, type Segment } from './data'

const DAY = 86400000

export const windowDays = (start: Date, end: Date) => Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY))

// ---------------------------------------------------------------------------
// Overview findings
// ---------------------------------------------------------------------------
// The Overview answers one question -- "what should I look at?" -- so it shows a
// small number of ranked findings rather than a wall of charts. A finding has to
// clear two independent bars before it earns a slot:
//
//   1. It must be big enough in absolute terms. `|net| >= 5` filters out the
//      three-member wobbles that a 2500-member roster produces constantly, so a
//      card never opens on noise.
//   2. It must matter relative to the segment it describes. `|net| >= 10%` is
//      measured against the segment's own size, not the whole roster, because a
//      swing in a 60-member segment is a far louder signal than the same count in
//      the full community.
//
// Both bars are required. Size alone lets a 5-member segment churn completely
// and claim to be a crisis; share alone lets a 400-member segment drift by 40
// and claim the same. The window is fixed at 7 days because findings are a "go
// look at this now" prompt -- a 90-day net smooths away exactly the changes a CM
// can still act on.
//
// Rolling cohorts are excluded outright. A `joinedWithinDays` segment is defined
// relative to `asOf` rather than by anything a member did, so advancing the clock
// by seven days necessarily pushes the oldest members out and pulls the newest
// in. Its net is therefore ~0 by construction, while its share is always large --
// the cohort is small compared to its own weekly turnover -- so it clears the
// share bar on arithmetic alone. Measured on this corpus, "New this month"
// reported +29 as a 41.4% swing and took the top slot ahead of "Contributors",
// which had lost five members but registered only 4.2%: a clock artifact
// outranking a real behavioural change is the opposite of what this screen is
// for. `joinedBeforeDays` is different and stays eligible: moving the clock
// forward only pushes members further past the boundary, so that segment can
// shrink but never manufactures entrants.

export const FINDING_WINDOW_DAYS = 7
export const MIN_ABS_NET = 5
export const MIN_SHARE = 0.1
const MAX_FINDINGS = 3

export type FindingKind = 'growing' | 'shrinking'

export interface OverviewFinding {
  id: string
  segmentId: string
  segmentName: string
  kind: FindingKind
  joined: number
  left: number
  net: number
  // Share of the segment that moved, used both for the threshold and the copy.
  share: number
  size: number
  // User-created segments outrank built-ins at equal magnitude: a CM's own
  // saved list is a deliberate statement of what they care about, whereas the
  // shipped built-ins are just the defaults they have never looked at.
  userDefined: boolean
}

function qualifies(net: number, size: number): boolean {
  if (Math.abs(net) < MIN_ABS_NET) return false
  return size > 0 && Math.abs(net) / size >= MIN_SHARE
}

// See the note on the window above: a cohort defined relative to `asOf` churns
// with the clock, so it can never produce a net worth reading.
function isRollingCohort(seg: Segment): boolean {
  return seg.criteria?.joinedWithinDays !== undefined
}

// `days` rather than `windowDays`: the parameter would otherwise shadow the
// module's own `windowDays` helper.
export function overviewFindings(asOf: Date = endDate, days = FINDING_WINDOW_DAYS): OverviewFinding[] {
  const to = asOf.getTime()
  const from = new Date(to - days * DAY)
  const out: OverviewFinding[] = []
  for (const seg of allSegments()) {
    if (isRollingCohort(seg)) continue
    const flow = segmentFlow(seg, from, asOf)
    const net = flow.joined.length - flow.left.length
    const size = segmentMembership(seg, asOf).length
    if (!qualifies(net, size)) continue
    out.push({
      id: `${seg.id}:${from.toISOString()}`,
      segmentId: seg.id,
      segmentName: seg.name,
      kind: net > 0 ? 'growing' : 'shrinking',
      joined: flow.joined.length,
      left: flow.left.length,
      net,
      share: size > 0 ? Math.abs(net) / size : 0,
      size,
      userDefined: !seg.builtIn,
    })
  }
  // Rank by how much of the segment moved, then by raw magnitude, then put
  // user-defined segments first. Ties break on segment name so the same corpus
  // always produces the same three cards in the same order.
  out.sort((a, b) => b.share - a.share || Math.abs(b.net) - Math.abs(a.net) || Number(b.userDefined) - Number(a.userDefined) || a.segmentName.localeCompare(b.segmentName))
  return out.slice(0, MAX_FINDINGS)
}

// ---------------------------------------------------------------------------
// Lead story
// ---------------------------------------------------------------------------
// One sentence a CM reads before anything else on the page. It is a single 40px
// paragraph whose load-bearing figures are set in `--content-primary` and whose
// connective grammar stays in `--content-secondary`, so the eye lands on the
// numbers rather than the sentence holding them up. That is why this returns runs
// instead of a string: a headline plus a detail line would put the emphasis in a
// different place from the thing it emphasises.
//
// Membership direction leads because it is the only thing on this screen that
// changes hands -- the headline cannot fix itself, and it is the signal most
// likely to be missed on a 2,500-member server.

export interface StoryRun { text: string; strong?: boolean }

export interface OverviewStory {
  runs: StoryRun[]
  tone: 'up' | 'down' | 'flat'
}

const strong = (text: string): StoryRun => ({ text, strong: true })
const plain = (text: string): StoryRun => ({ text })

// Half a point of retention is noise, not a contradiction worth a clause.
const RETENTION_FLOOR = 0.5

// The second clause appears only when retention moves *against* membership. When
// the two agree, restating it is noise; when they disagree, that contradiction is
// the most useful sentence on the screen, and it is the shape Figma's copy takes
// ("grew by 157 members ... but member retention declined by 6pp").
export function overviewStory(w: DashboardWindow): OverviewStory {
  const days = windowDays(w.start, w.end)
  const net = w.joined - w.left
  const runs: StoryRun[] = [plain('Your community ')]
  if (net > 0) runs.push(strong(`grew by ${formatNumber(net)} ${net === 1 ? 'member' : 'members'}`))
  else if (net < 0) runs.push(strong(`shrank by ${formatNumber(-net)} ${Math.abs(net) === 1 ? 'member' : 'members'}`))
  else runs.push(strong(`held steady at ${formatNumber(w.totalMembers)} members`))
  runs.push(plain(` in the last ${days} days`))
  const retention = w.delta.retention
  if (net >= 0 ? retention < -RETENTION_FLOOR : retention > RETENTION_FLOOR) {
    runs.push(plain(', but member '))
    runs.push(strong(retention < 0 ? `retention declined by ${Math.abs(retention).toFixed(1)}pp` : `retention rose by ${retention.toFixed(1)}pp`))
  }
  runs.push(plain('.'))
  return { runs, tone: net > 0 ? 'up' : net < 0 ? 'down' : 'flat' }
}

// ---------------------------------------------------------------------------
// Stat card sparklines
// ---------------------------------------------------------------------------
// One bar series per stat card, so a card carries both "where it is" and "which
// way it has been moving" without a CM having to open a chart. Bars rather than a
// line: at card width there is no room for a stroke that stays legible, and
// joined/left are counts per day, which is what bars say honestly.

export const SPARK_BUCKETS = 28

export interface OverviewSparkBars {
  total: number[]
  active: number[]
  newMembers: number[]
  leftMembers: number[]
}

// A 90-day window would need 90 bars; at 4px wide plus a 3px gap that is 630px
// inside a 266px card. Buckets are averaged for the two level series and summed
// for the two event series, because averaging joins would invent fractional
// members per day and summing a roster would report ninety times the community.
function resample(points: MembershipPoint[], key: 'roster' | 'active' | 'joined' | 'left'): number[] {
  if (points.length <= SPARK_BUCKETS) return points.map((p) => p[key])
  const flow = key === 'joined' || key === 'left'
  const out: number[] = []
  for (let i = 0; i < SPARK_BUCKETS; i++) {
    const lo = Math.floor((i * points.length) / SPARK_BUCKETS)
    const hi = Math.max(lo + 1, Math.floor(((i + 1) * points.length) / SPARK_BUCKETS))
    const slice = points.slice(lo, hi)
    const sum = slice.reduce((n, p) => n + p[key], 0)
    out.push(flow ? sum : sum / slice.length)
  }
  return out
}

export function overviewSparkBars(w: DashboardWindow): OverviewSparkBars {
  const points = membershipSeries(w.start, w.end)
  return {
    total: resample(points, 'roster'),
    active: resample(points, 'active'),
    newMembers: resample(points, 'joined'),
    leftMembers: resample(points, 'left'),
  }
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------
// The greeting names the community rather than the viewer. Mithril is a
// single-community tool with no account model, so "Good morning, <Community
// Manager>" would assert a role the prototype has no way to know; naming the
// community is both true and what the product is actually about.
//
// Resolved from the viewer's local clock (`getHours`), which is the PC's own
// timezone — deliberately not the corpus timezone, since this is a greeting to
// the person looking at the screen. The emoji tracks the same four bands so
// the line reads differently across a full day. Evaluated at render time, so
// it does not tick over while the page stays open.

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good Morning \u{1F305}'
  if (h < 18) return 'Good Afternoon \u2600\uFE0F'
  if (h < 22) return 'Good Evening \u{1F306}'
  return 'Good Night \u{1F319}'
}
