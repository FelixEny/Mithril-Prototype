import { dashboardWindow, formatNumber, type RangeDays } from './analytics'
import { allSegments, segmentFlow, segmentMembership } from './segments'
import { endDate, type Segment } from './data'

const DAY = 86400000

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

export function overviewFindings(asOf: Date = endDate, windowDays = FINDING_WINDOW_DAYS): OverviewFinding[] {
  const to = asOf.getTime()
  const from = new Date(to - windowDays * DAY)
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
// Overview snapshot
// ---------------------------------------------------------------------------

export interface OverviewStory {
  headline: string
  detail: string
  tone: 'up' | 'down' | 'flat'
}

export interface OverviewSnapshot {
  window: { start: Date; end: Date; days: number }
  // Point-in-time, "as of <end>".
  total: number
  // Period movement, over the selected window.
  newMembers: number
  leftMembers: number
  net: number
  participationRate: number
  activeMembers: number
  findings: OverviewFinding[]
  story: OverviewStory
}

export function overviewSnapshot(days: RangeDays = 30): OverviewSnapshot {
  const end = new Date(endDate.getTime())
  return overviewWindow(new Date(end.getTime() - days * DAY), end)
}

// `total` is point-in-time and everything else is period movement, so the two
// are kept as separate fields rather than one "members" number. A CM reading
// "2,507" needs to know it is the roster right now, not the roster a month ago.
export function overviewWindow(start: Date, end: Date): OverviewSnapshot {
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY))
  const w = dashboardWindow(start, end)
  const net = w.joined - w.left
  return {
    window: { start, end, days },
    total: w.roster.atEnd,
    newMembers: w.joined,
    leftMembers: w.left,
    net,
    participationRate: w.current.activeRate,
    activeMembers: w.current.active,
    findings: overviewFindings(end),
    story: leadStory(w.roster.atEnd, net, days, w.joined, w.left),
  }
}

// The lead story is one sentence a CM reads before anything else. It leads with
// direction of membership movement, because that is the only thing on this screen
// that changes hands -- the headline cannot fix itself and it is the signal most
// likely to be missed in a 2500-member server.
function leadStory(total: number, net: number, days: number, joined: number, left: number): OverviewStory {
  const roster = `${formatNumber(total)} members`
  if (net > 0) {
    return {
      tone: 'up',
      headline: `${roster} and growing`,
      detail: `${formatNumber(net)} more ${net === 1 ? 'member' : 'members'} than ${days} days ago, after ${formatNumber(joined)} joined and ${formatNumber(left)} left.`,
    }
  }
  if (net < 0) {
    return {
      tone: 'down',
      headline: `${roster}, but shrinking`,
      detail: `${formatNumber(Math.abs(net))} fewer ${Math.abs(net) === 1 ? 'member' : 'members'} than ${days} days ago, after ${formatNumber(joined)} joined and ${formatNumber(left)} left.`,
    }
  }
  return {
    tone: 'flat',
    headline: `${roster}, holding steady`,
    detail: `${formatNumber(joined)} joined and ${formatNumber(left)} left over the last ${days} days.`,
  }
}

// ---------------------------------------------------------------------------
// Greeting
// ---------------------------------------------------------------------------
// The greeting names the community rather than the viewer. Mithril is a
// single-community tool with no account model, so "Good morning, <Community
// Manager>" would assert a role the prototype has no way to know; naming the
// community is both true and what the product is actually about.

export function greeting(now: Date): string {
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
export function overviewSparkBars(){return {total:[],active:[],newMembers:[],leftMembers:[]}}
