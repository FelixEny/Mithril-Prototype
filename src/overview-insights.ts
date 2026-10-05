import { formatNumber, formatPercent, type DashboardWindow } from './analytics'
import { windowDays } from './overview'
import type { PageKey } from './components/Sidebar'

// ---------------------------------------------------------------------------
// Community insights
// ---------------------------------------------------------------------------
// The four columns under "Community insights". Each is one observation about the
// selected window, and each is always populated: the card is the screen's main
// body, so an empty column would read as "nothing to say" on a page that exists
// to say something.
//
// Two of the four are *comparative* (they need a direction against the prior
// window) and two are *structural* (a level, not a movement). Splitting them that
// way is deliberate -- retention falling is a different kind of news from a third
// of the roster being quiet, and forcing both through one "pick the biggest delta"
// rule would make the card oscillate between four arbitrary metrics as the range
// changes.
//
// Every figure here is read straight off `DashboardWindow`; nothing is invented
// for the copy. Where a comparative metric has no movement to report, the column
// falls back to naming the weakest/strongest current level instead of inventing a
// direction, because "retention is flat" and "retention is your weakest rate" are
// both true and only one of them is a claim the data supports.
//
// The column splits its copy three ways on purpose:
//   title          the movement, headline weight
//   detail         the level against the prior window, body weight
//   recommendation the action, in the tinted block
// Keeping every figure in `detail` is what lets the recommendation stay readable
// prose -- a recommendation that quotes numbers is a second copy of the line
// above it.
//
// `PageKey` is imported type-only. The data layer decides *which page* answers a
// question; it never navigates.

export type InsightTone = 'attention' | 'positive' | 'opportunity' | 'notable'

export interface OverviewInsight {
  id: string
  tone: InsightTone
  /** Chip text. */
  label: string
  title: string
  detail: string
  /** What a CM could do about this. */
  recommendation: string
  /** Page the "view in ..." link opens. */
  link: PageKey
  linkLabel: string
}

// Rate metrics, which move in percentage points and so are compared as pp rather
// than as growth percentages like `messages` or `joined`. `noun` is the
// denominator phrase the level is expressed against, so one sentence template can
// serve all five: "34.6% of messages drew a reply".
const RATE_METRICS = [
  { key: 'retention', label: 'Retention', noun: 'of members returned' },
  { key: 'activation', label: 'New member activation', noun: 'of new members activated within 7 days' },
  { key: 'activeRate', label: 'Participation rate', noun: 'of members participated' },
  { key: 'replyRate', label: 'Reply rate', noun: 'of messages drew a reply' },
  { key: 'reactionRate', label: 'Reaction rate', noun: 'of messages drew a reaction' },
] as const

// Below this, a movement is rounding noise and the column reports the level
// instead. Matches the floor the lead story uses to decide whether retention is
// worth a second clause.
const FLOOR = 0.5

// Rate figures get one decimal, not the whole-number treatment `formatPercent`
// gives everything else. A rate that moved 0.6pp is the difference between
// "34%" and "34.6%", and at zero decimals the title would claim a drop while the
// detail line underneath showed the same number twice. The trailing ".0" is
// trimmed so a rate that happens to land on a whole percent still reads "49%"
// rather than "49.0%".
const formatRate = (value: number) => `${Number(value.toFixed(1))}%`
// pp deltas, same trimming: "28pp", not "28.0pp".
const formatPp = (value: number) => `${Math.abs(Number(value.toFixed(1)))}pp`

export function overviewInsights(w: DashboardWindow): OverviewInsight[] {
  const days = windowDays(w.start, w.end)
  const rates = RATE_METRICS.map((m) => ({ ...m, level: w.current[m.key], delta: w.delta[m.key] }))
  const worst = rates.reduce((a, b) => (b.delta < a.delta ? b : a))
  const best = rates.reduce((a, b) => (b.delta > a.delta ? b : a))

  // Rate deltas are percentage points, so the prior level is the current one minus
  // the delta -- which is how the detail sentence gets "62% ... compared to 68%".
  const priorOf = (level: number, delta: number) => level - delta
  const detailFor = (m: { noun: string; level: number; delta: number }) =>
    `${formatRate(m.level)} ${m.noun}, against ${formatRate(priorOf(m.level, m.delta))} in the previous ${days} days`

  const active = Math.max(1, w.current.active)
  const voiceOnlyPct = (w.current.voiceOnly / active) * 100

  // `w.tiers` is a trailing-28-day count of the roster at `end`, not a count over
  // the selected window, so this column is worded against the 28-day engine and
  // never against `days`.
  const quiet = w.tiers.filter((t) => t.tier === 'Lurker' || t.tier === 'Inactive').reduce((n, t) => n + t.value, 0)
  const quietPct = w.totalMembers ? (quiet / w.totalMembers) * 100 : 0

  return [
    worst.delta < -FLOOR
      ? {
        id: 'attention', tone: 'attention', label: 'Needs attention',
        title: `${worst.label} dropped by ${formatPp(worst.delta)}`,
        detail: detailFor(worst),
        recommendation: 'Consider a re-engagement push before this rate lapses further. It is the sharpest move on the page, and the members behind it are still on the roster.',
        link: 'Engagement', linkLabel: 'View in engagement',
      }
      : {
        id: 'attention', tone: 'attention', label: 'Needs attention',
        title: `${worst.label} is your weakest rate`,
        detail: detailFor(worst),
        recommendation: 'Nothing here is falling quickly, so read this as headroom rather than damage. It is the lowest rate on the page, and it is the one with the most left to gain.',
        link: 'Engagement', linkLabel: 'View in engagement',
      },
    best.delta > FLOOR
      ? {
        id: 'positive', tone: 'positive', label: 'Positive',
        title: `${best.label} improved by ${formatPp(best.delta)}`,
        detail: detailFor(best),
        recommendation: 'Keep the momentum going. This is the strongest signal on the page, and the window it moved in is the one to look back at.',
        link: 'Engagement', linkLabel: 'View in engagement',
      }
      : {
        id: 'positive', tone: 'positive', label: 'Positive',
        title: `${best.label} is your strongest rate`,
        detail: detailFor(best),
        recommendation: 'This rate is healthy and holding. Work out what is protecting it before assuming it will stay that way.',
        link: 'Engagement', linkLabel: 'View in engagement',
      },
    {
      id: 'opportunity', tone: 'opportunity', label: 'Opportunity',
      title: `${formatPercent(voiceOnlyPct)} of active members never posted`,
      detail: `${formatNumber(w.current.voiceOnly)} of ${formatNumber(active)} members who were active this period joined voice but no text channel.`,
      recommendation: 'These members already show up, just not in writing. A prompt in the channel they join is a much shorter route to a conversation than a cold start.',
      link: 'Engagement', linkLabel: 'View in engagement',
    },
    {
      id: 'notable', tone: 'notable', label: 'Notable',
      title: `${formatPercent(quietPct)} of the roster is quiet`,
      detail: `${formatNumber(quiet)} of ${formatNumber(w.totalMembers)} members are Lurker or Inactive across the trailing 28 days. This is a roster shape, not a change over the selected period.`,
      recommendation: 'A quiet majority is normal. The useful question is which of them still answer when a thread calls them out by name.',
      link: 'Relationships', linkLabel: 'View in relationship',
    },
  ]
}