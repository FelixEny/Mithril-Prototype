import { channels, conversations, endDate, members, messages, presentAt, voiceSessions, type Message, type VoiceSession } from './data'
import type { RangeDays } from './ranges'
// Re-exported so the pages keep importing the window type from the analytics
// entry point they already use; the preset list itself lives in ./ranges.
export type { RangeDays } from './ranges'
const day = 86400000; const unique = <T,>(items: T[]) => new Set(items)
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const formatNumber = (value: number) => new Intl.NumberFormat('en-US', { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
export const formatPercent = (value: number) => `${Math.round(value)}%`
// Heatmap intensity levels. Active Members is the primary metric driving the
// cell colors: each cell holds the average unique active members for its
// weekday/hour slot across that weekday's occurrences in the window, so these
// are absolute thresholds independent of the selected range. Message volume is
// carried alongside on the cell but only informs the tooltip and peak scoring.
const heatActiveBounds = [8, 20, 40, 70, 105, 145]
export const heatActiveLevel = (count: number) => {
  for (let i = 0; i < heatActiveBounds.length; i++) if (count <= heatActiveBounds[i]) return i + 1
  return 7
}

// ---------------------------------------------------------------------------
// Per-member index so per-member queries don't rescan the full corpus.
// Built lazily once; the raw arrays are static.
// ---------------------------------------------------------------------------
let indexed = false
const messagesByMember = new Map<string, Message[]>()
const voiceByMember = new Map<string, VoiceSession[]>()
const eventsByMember = new Map<string, number[]>()
// Timestamps (at message time, the same source as the reactor events above) at
// which each member gave a reaction. Reactions sent are activity everywhere the
// product counts it: the KPI active set already includes reactors through
// eventsByMember, and the tiers/snapshot activeDays below include them here.
const reactionsByMember = new Map<string, number[]>()
function ensureIndex() {
  if (indexed) return
  const push = (map: Map<string, any[]>, id: string, item: any) => {
    let arr = map.get(id)
    if (!arr) { arr = []; map.set(id, arr) }
    arr.push(item)
  }
  for (const x of messages) {
    push(messagesByMember, x.memberId, x)
    push(eventsByMember, x.memberId, x.at.getTime())
    for (const rid of x.reactorIds) { push(eventsByMember, rid, x.at.getTime()); push(reactionsByMember, rid, x.at.getTime()) }
  }
  for (const v of voiceSessions) {
    push(voiceByMember, v.memberId, v)
    push(eventsByMember, v.memberId, v.at.getTime())
  }
  for (const arr of eventsByMember.values()) arr.sort((a, b) => a - b)
  indexed = true
}
const anyIn = (arr: number[] | undefined, startMs: number, endMs: number) => {
  if (!arr || !arr.length) return false
  let lo = 0, hi = arr.length
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < startMs) lo = mid + 1; else hi = mid }
  return arr[lo] !== undefined && arr[lo] <= endMs
}
const activeIds = (start: Date, end: Date) => {
  ensureIndex()
  const s = start.getTime(), e = end.getTime(), out = new Set<string>()
  for (const [id, ts] of eventsByMember) if (anyIn(ts, s, e)) out.add(id)
  return out
}
const isActive = (id: string, start: Date, end: Date) => { ensureIndex(); return anyIn(eventsByMember.get(id), start.getTime(), end.getTime()) }
// Local-calendar day stamps on which the member gave at least one reaction, at
// or after `cutoffMs`. Same day-key convention as the message/voice day stamps
// the tier and snapshot activeDays counts are built from.
const reactionDays = (id: string, cutoffMs: number) => { ensureIndex(); return (reactionsByMember.get(id) ?? []).filter(t => t >= cutoffMs).map(t => new Date(t).toDateString()) }

export const TIERS = ['Superuser', 'Contributor', 'Regular', 'Lurker', 'Inactive'] as const
export type ActivityTier = (typeof TIERS)[number]
export const TIER_COLORS: Record<ActivityTier, string> = { Superuser: 'var(--chart-superuser)', Contributor: 'var(--chart-contributor)', Regular: 'var(--chart-regular)', Lurker: 'var(--chart-lurker)', Inactive: 'var(--chart-inactive)' }
const tierCache = new Map<number, Map<string, ActivityTier>>()
export function activityTiers(end: Date): Map<string, ActivityTier> {
  const endMs = end.getTime()
  const hit = tierCache.get(endMs)
  if (hit) return hit
  ensureIndex()
  const cutoff = new Date(endMs - 28 * day)
  // Only members still on the server at `end` are tiered. Someone who left is no
  // longer part of the community's engagement mix, and counting them as
  // Inactive would silently inflate the Inactive bar after every departure --
  // the tier distribution would read as a decline in engagement when the roster
  // simply shrank.
  const scored = members.filter(m => presentAt(m, end)).map(m => {
    const own = (messagesByMember.get(m.id) ?? []).filter(x => x.at >= cutoff)
    const voice = (voiceByMember.get(m.id) ?? []).filter(x => x.at >= cutoff)
    // Reactions sent are activity too: a member whose only participation is
    // reacting has active days, so they tier as Lurker-grade, never Inactive.
    const activeDays = unique([...own.map(x => x.at.toDateString()), ...voice.map(x => x.at.toDateString()), ...reactionDays(m.id, cutoff.getTime())]).size
    const breadth = unique(own.map(x => x.channelId)).size
    const interactions = own.reduce((n, x) => n + (x.hasReply ? 1 : 0) + x.reactions, 0)
    return { id: m.id, activeDays, score: activeDays * .5 + Math.log1p(own.length) * 2 + Math.log1p(interactions) + breadth }
  }).sort((a, b) => b.score - a.score)
  const actives = scored.filter(x => x.activeDays > 0)
  const out = new Map<string, ActivityTier>()
  // Members who are not on the roster at `end` are mapped to Inactive rather than
  // omitted: consumers index the tier map by member id (MemberPopup, profile
  // rows) and an absent key would read as "unknown tier". Callers that count
  // members must filter on presentAt themselves.
  for (const m of members) if (m.bot || !presentAt(m, end)) out.set(m.id, 'Inactive')
  for (const [i, m] of scored.entries()) {
    const band = !m.activeDays ? 'Inactive' : i < Math.ceil(actives.length * .05) ? 'Superuser' : i < Math.ceil(actives.length * .2) ? 'Contributor' : m.activeDays >= 5 ? 'Regular' : 'Lurker'
    // The top bands imply sustained contribution: a short burst can outscore
    // most actives on volume, so without 5+ active days it falls to Lurker.
    out.set(m.id, (band === 'Superuser' || band === 'Contributor') && m.activeDays < 5 ? 'Lurker' : band)
  }
  tierCache.set(endMs, out)
  return out
}

// ---------------------------------------------------------------------------
// Per-member activity snapshot for a trailing window. Segments (saved
// filtered lists) evaluate their criteria against this so the segment engine
// and any segment flow card share one signal source. Cached per (asOf, days).
// ---------------------------------------------------------------------------
export type ActivitySnapshot = { tier: ActivityTier; activeDays: number; messages: number; reactionsReceived: number; voiceMinutes: number; lastActiveAtMs: number }
const snapshotCache = new Map<string, Map<string, ActivitySnapshot>>()
export function activitySnapshot(asOf: Date, days = 28): Map<string, ActivitySnapshot> {
  const asOfMs = asOf.getTime()
  const key = `${asOfMs}:${days}`
  const hit = snapshotCache.get(key)
  if (hit) return hit
  ensureIndex()
  const cutoff = asOfMs - days * day
  const tiers = activityTiers(asOf)
  const out = new Map<string, ActivitySnapshot>()
  for (const m of members) {
    if (m.bot) continue
    const own = (messagesByMember.get(m.id) ?? []).filter(x => x.at.getTime() >= cutoff)
    const voice = (voiceByMember.get(m.id) ?? []).filter(x => x.at.getTime() >= cutoff)
    const activeDays = unique([...own.map(x => x.at.toDateString()), ...voice.map(x => x.at.toDateString()), ...reactionDays(m.id, cutoff)]).size
    const allEvents = eventsByMember.get(m.id)
    out.set(m.id, {
      tier: tiers.get(m.id) ?? 'Inactive',
      activeDays,
      messages: own.length,
      reactionsReceived: own.reduce((n, x) => n + x.reactions, 0),
      voiceMinutes: voice.reduce((n, x) => n + x.minutes, 0),
      lastActiveAtMs: allEvents && allEvents.length ? allEvents[allEvents.length - 1] : -Infinity,
    })
  }
  snapshotCache.set(key, out)
  return out
}

export function dashboard(days: RangeDays) {
  return dashboardWindow(new Date(endDate.getTime() - days * day), endDate)
}
export interface DashboardWindow {
  start: Date
  end: Date
  current: { active: number; activeRate: number; activation: number; retention: number; messages: number; replyRate: number; reactionRate: number; voice: number; voiceMinutes: number; voiceOnly: number }
  totalMembers: number
  // Roster denominators. They differ because members leave mid-window:
  // `atEnd` is the point-in-time "as of <end>" total the Overview headlines,
  // while `inWindow` is everyone who was on the server at any point during the
  // window -- the only denominator a participation rate can use without
  // exceeding 100% when someone leaves after being active.
  roster: { atEnd: number; inWindow: number }
  joined: number
  left: number
  // Membership movement got period-over-period deltas too. The Overview headlines
  // four membership stats side by side, and a change chip that only exists on the
  // activity metrics would read as "we only track growth on engagement". These
  // are percentages against the equally-long prior window, matching `active` and
  // `messages`; the rate metrics above stay in percentage points.
  delta: { active: number; activeRate: number; activation: number; retention: number; messages: number; replyRate: number; reactionRate: number; voice: number; voiceMinutes: number; totalMembers: number; joined: number; left: number }
  activation: { activated: number; eligible: number }
  retention: { returned: number; prior: number }
  series: { label: string; date: string; messages: number; active: number; voice: number }[]
  tiers: { tier: ActivityTier; value: number }[]
  // One weekday × hour grid driving both the heatmap and peak summaries. Each
  // cell holds the per-occurrence averages for its slot: `active` (unique
  // active members) is the primary metric for cell colors; `messages` rides
  // along for the tooltip and the weighted peak scoring.
  heat: { weekday: number; hour: number; active: number; messages: number }[][]
  // Peak periods, ranked by a normalized 70/30 active/messages score. `relative`
  // is the block's mean cell score ÷ the window-wide baseline score (≈ the
  // average hourly activity, expressed as × the baseline).
  peaks: { weekday: number; minHour: number; maxHour: number; avgActive: number; avgMessages: number; score: number; relative: number }[]
  channelRows: { id: string; name: string; messages: number; active: number }[]
  // `lastAt` is the most recent message in the row's 3-hour activity slice. The
  // Mithril feed needs a real event time for its "3h ago" column; the other three
  // feed rows are window aggregates and have none, which is why this field exists
  // only here rather than on the window as a whole.
  discussionRows: { id: string; channelId: string; text: string; channel: string; replies: number; reactions: number; participants: number; avatars: { id: string; name: string }[]; score: number; lastAt: Date | null }[]
}
const dashboardCache = new Map<string, DashboardWindow>()
export function dashboardWindow(start: Date, end: Date): DashboardWindow {
  const cacheKey = `${start.getTime()}|${end.getTime()}`
  const hit = dashboardCache.get(cacheKey)
  if (hit) return hit
  const lengthDays = (end.getTime() - start.getTime()) / day, previousStart = new Date(start.getTime() - lengthDays * day)
  const periodMessages = messages.filter(x => x.at >= start && x.at <= end), periodVoice = voiceSessions.filter(x => x.at >= start && x.at <= end), active = activeIds(start, end), prior = activeIds(previousStart, start)
  const humans = members.filter(m => !m.bot)
  // Point-in-time roster vs window roster. A member who left during the window
  // was still here to participate, so they count in the participation
  // denominator but not in the "as of" total.
  const rosterAtEnd = humans.filter(m => presentAt(m, end)).length
  const rosterInWindow = humans.filter(m => m.joinedAt.getTime() <= end.getTime() && (m.leftAt === null || m.leftAt.getTime() > start.getTime())).length
  const joined = humans.filter(m => m.joinedAt > start && m.joinedAt <= end).length
  const left = humans.filter(m => m.leftAt !== null && m.leftAt > start && m.leftAt <= end).length
  const totalMembers = rosterAtEnd
  // Prior-window membership movement. `rosterAtStart` is the roster the current
  // window opened on, which is the only fair denominator for the roster's growth:
  // comparing against today's roster would divide a departure by a number that
  // already excludes the person who left.
  const rosterAtStart = humans.filter(m => presentAt(m, start)).length
  const joinedPrior = humans.filter(m => m.joinedAt > previousStart && m.joinedAt <= start).length
  const leftPrior = humans.filter(m => m.leftAt !== null && m.leftAt > previousStart && m.leftAt <= start).length
  // Activation: only members who still existed at the end of their own 7-day
  // window can have activated. Someone who left on day 2 never got the chance,
  // and counting them as a failed activation would blame them for leaving.
  const eligible = humans.filter(m => m.joinedAt >= start && m.joinedAt <= new Date(end.getTime() - 7 * day)); const activated = eligible.filter(m => presentAt(m, new Date(m.joinedAt.getTime() + 7 * day)) && isActive(m.id, m.joinedAt, new Date(m.joinedAt.getTime() + 7 * day))).length
  const eligiblePrior = humans.filter(m => m.joinedAt >= previousStart && m.joinedAt <= new Date(start.getTime() - 7 * day)); const activatedPrior = eligiblePrior.filter(m => presentAt(m, new Date(m.joinedAt.getTime() + 7 * day)) && isActive(m.id, m.joinedAt, new Date(m.joinedAt.getTime() + 7 * day))).length
  const voiceIds = unique(periodVoice.map(x => x.memberId)), messageIds = unique(periodMessages.map(x => x.memberId))
  // Retention is the canonical fixed-28-day headline: the selected range only
  // moves the observation point `end`, never the window. Departures stay out of
  // the denominator by construction (eligible returners must still be on the
  // roster at the window boundary) and are reported separately under Left.
  const retHead = retentionHeadline(end)
  const activeRate = rosterInWindow ? active.size / rosterInWindow * 100 : 0, priorRate = rosterInWindow ? prior.size / rosterInWindow * 100 : 0, activationRate = eligible.length ? activated / eligible.length * 100 : 0, priorActivation = eligiblePrior.length ? activatedPrior / eligiblePrior.length * 100 : 0
  const current = { active: active.size, activeRate, activation: activationRate, retention: retHead.current, messages: periodMessages.length, replyRate: periodMessages.filter(x => x.hasReply).length / Math.max(1, periodMessages.length) * 100, reactionRate: periodMessages.filter(x => x.reactions > 0).length / Math.max(1, periodMessages.length) * 100, voice: voiceIds.size, voiceMinutes: periodVoice.reduce((n, x) => n + x.minutes, 0), voiceOnly: [...voiceIds].filter(x => !messageIds.has(x)).length }
  const visibleDays = Math.min(Math.round(lengthDays), 30); const series = Array.from({ length: visibleDays }, (_, i) => { const s = new Date(end.getTime() - (visibleDays - i) * day), e = new Date(s.getTime() + day), rows = periodMessages.filter(x => x.at >= s && x.at < e); return { label: `${s.getUTCMonth()+1}/${s.getUTCDate()}`, date: `${monthNames[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}`, messages: rows.length, active: activeIds(s, e).size, voice: unique(periodVoice.filter(x => x.at >= s && x.at < e).map(x => x.memberId)).size } })
  // Counted over the members on the roster at `end` only. activityTiers maps
  // departed members to 'Inactive' so per-id lookups always resolve, but
  // counting that map's values verbatim would file every leaver under Inactive and
  // make the tier distribution read as an engagement collapse after each
  // departure wave. The tier bars describe who is here now, so they sum to
  // rosterAtEnd rather than to every member who ever joined.
  const tierMap = activityTiers(end); const tiers = TIERS.map(tier => ({ tier, value: humans.filter(m => presentAt(m, end) && tierMap.get(m.id) === tier).length }))
  // Per-weekday occurrence counts in [start, end]: a window rarely holds whole
  // weeks (30d covers Sun/Mon 5x but Tue-Sat 4x; custom ranges vary more), so
  // each weekday row is divided by its own occurrence count rather than a
  // uniform lengthDays/7. Fractional occurrences come from walking the window
  // hour by hour, which also absorbs partial edge days. Each cell value is the
  // average for that weekday/hour across its occurrences in the window.
  const weekdayHours = [0, 0, 0, 0, 0, 0, 0]
  for (let t = start.getTime(); t < end.getTime(); t += 3600000) weekdayHours[(new Date(t).getUTCDay() + 6) % 7]++
  const weekdayOcc = weekdayHours.map((h) => Math.max(h / 24, 1 / 24))
  // Bucket period events once by day:hour so the per-cell scan below is O(cells)
  // instead of rescannning the corpus per cell. Day interior matches the
  // `(weekday + 1) % 7` ↔ getUTCDay mapping used across the window.
  const dayHour = (d: Date) => `${d.getUTCDay()}:${d.getUTCHours()}`
  const bucket = <T,>(map: Map<string, T[]>, key: string): T[] => { const hit = map.get(key); if (hit) return hit; const arr: T[] = []; map.set(key, arr); return arr }
  const msgBySlot = new Map<string, Message[]>()
  const voiceBySlot = new Map<string, VoiceSession[]>()
  for (const x of periodMessages) bucket(msgBySlot, dayHour(x.at)).push(x)
  for (const v of periodVoice) bucket(voiceBySlot, dayHour(v.at)).push(v)
  const heat = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => {
    const key = `${(weekday + 1) % 7}:${hour}`
    const msgs = msgBySlot.get(key) ?? []
    const ids = new Set<string>()
    for (const m of msgs) { ids.add(m.memberId); for (const r of m.reactorIds) ids.add(r) }
    for (const v of voiceBySlot.get(key) ?? []) ids.add(v.memberId)
    return { weekday, hour, active: ids.size / weekdayOcc[weekday], messages: msgs.length / weekdayOcc[weekday] }
  }))
  // Peak scoring shares one deterministic method with the panel rows and the
  // feed: each metric is normalized to its own window max (0..1) so message
  // volume cannot dwarf the member count, then combined 70/30 toward active
  // members -- a peak is where the community is both busy and reachable, not
  // merely loud. The baseline is the same weighted formula over the window-wide
  // hourly averages, so `relative` reads as "× the average hour".
  const flatCells = heat.flat()
  const maxActive = Math.max(...flatCells.map(c => c.active), 1)
  const maxMessages = Math.max(...flatCells.map(c => c.messages), 1)
  const cellScore = (c: { active: number; messages: number }) => (c.active / maxActive) * 0.7 + (c.messages / maxMessages) * 0.3
  const avgActive = flatCells.reduce((n, c) => n + c.active, 0) / flatCells.length
  const avgMessages = flatCells.reduce((n, c) => n + c.messages, 0) / flatCells.length
  const baseline = (avgActive / maxActive) * 0.7 + (avgMessages / maxMessages) * 0.3
  const peakBlocks: { weekday: number; minHour: number; maxHour: number; cells: { weekday: number; hour: number; active: number; messages: number }[] }[] = []
  for (const cell of flatCells.filter(c => cellScore(c) > 0).sort((a, b) => cellScore(b) - cellScore(a) || b.active - a.active || a.hour - b.hour || a.weekday - b.weekday).slice(0, 8)) {
    let placed = false
    for (const b of peakBlocks) {
      if (b.weekday !== cell.weekday) continue
      if (cell.hour === b.maxHour + 1) { b.maxHour = cell.hour; b.cells.push(cell); placed = true; break }
      if (cell.hour === b.minHour - 1) { b.minHour = cell.hour; b.cells.push(cell); placed = true; break }
    }
    if (!placed && peakBlocks.length < 3) peakBlocks.push({ weekday: cell.weekday, minHour: cell.hour, maxHour: cell.hour, cells: [cell] })
  }
  const peaks = peakBlocks.map(b => {
    const score = b.cells.reduce((n, c) => n + cellScore(c), 0) / b.cells.length
    return { weekday: b.weekday, minHour: b.minHour, maxHour: b.maxHour, avgActive: b.cells.reduce((n, c) => n + c.active, 0) / b.cells.length, avgMessages: b.cells.reduce((n, c) => n + c.messages, 0) / b.cells.length, score, relative: score / Math.max(baseline, 1e-6) }
  }).sort((a, b) => b.score - a.score || b.avgActive - a.avgActive)
  const channelRows = channels.map(c => ({ ...c, messages: periodMessages.filter(x => x.channelId === c.id).length, active: unique(periodMessages.filter(x => x.channelId === c.id).map(x => x.memberId)).size })).sort((a,b)=>b.messages-a.messages)
  const discussionRows = conversations.map(c => { const items = periodMessages.filter(x => x.conversationId === c.id), recent = items.filter(x => x.at >= new Date(end.getTime()-3*3600000)), priorItems = items.filter(x => x.at >= new Date(end.getTime()-27*3600000) && x.at < new Date(end.getTime()-3*3600000)), velocity = recent.reduce((n,x)=>n+(x.hasReply?1:0)+x.reactions*.5,0)+unique(recent.map(x=>x.memberId)).size, baseline = (priorItems.reduce((n,x)=>n+(x.hasReply?1:0)+x.reactions*.5,0)+unique(priorItems.map(x=>x.memberId)).size)/8, avatars = [...recent].sort((a,b)=>b.at.getTime()-a.at.getTime()).reduce((map,x)=>map.has(x.memberId)?map:map.set(x.memberId,(members.find(m=>m.id===x.memberId)?.name ?? x.memberId)),new Map<string,string>()); return { ...c, channel: channels.find(x=>x.id===c.channelId)!.name, replies: recent.filter(x=>x.hasReply).length, reactions: recent.reduce((n,x)=>n+x.reactions,0), participants: unique(recent.map(x=>x.memberId)).size, avatars: [...avatars].slice(0,3).map(([id,name])=>({id,name})), score: velocity / (baseline || 1), lastAt: recent.length ? new Date(Math.max(...recent.map(x => x.at.getTime()))) : null } }).sort((a,b)=>b.score-a.score)
  const priorMessages = messages.filter(x => x.at >= previousStart && x.at < start), priorVoice = voiceSessions.filter(x => x.at >= previousStart && x.at < start), priorReplyRate = priorMessages.filter(x => x.hasReply).length / Math.max(1, priorMessages.length) * 100, priorReactionRate = priorMessages.filter(x => x.reactions > 0).length / Math.max(1, priorMessages.length) * 100, priorVoiceIds = unique(priorVoice.map(x => x.memberId)).size, priorVoiceMinutes = priorVoice.reduce((n, x) => n + x.minutes, 0)
  const delta = { active: prior.size ? (active.size - prior.size) / prior.size * 100 : 0, activeRate: activeRate - priorRate, activation: activationRate - priorActivation, retention: retHead.delta, messages: priorMessages.length ? (periodMessages.length - priorMessages.length) / priorMessages.length * 100 : 0, replyRate: current.replyRate - priorReplyRate, reactionRate: current.reactionRate - priorReactionRate, voice: priorVoiceIds ? (voiceIds.size - priorVoiceIds) / priorVoiceIds * 100 : 0, voiceMinutes: priorVoiceMinutes ? (current.voiceMinutes - priorVoiceMinutes) / priorVoiceMinutes * 100 : 0, totalMembers: rosterAtStart ? (rosterAtEnd - rosterAtStart) / rosterAtStart * 100 : 0, joined: joinedPrior ? (joined - joinedPrior) / joinedPrior * 100 : 0, left: leftPrior ? (left - leftPrior) / leftPrior * 100 : 0 }
  const result = { start, end, current, totalMembers, roster: { atEnd: rosterAtEnd, inWindow: rosterInWindow }, joined, left, delta, activation: { activated, eligible: eligible.length }, retention: { returned: retHead.returned, prior: retHead.eligible }, series, tiers, heat, peaks, channelRows, discussionRows }
  dashboardCache.set(cacheKey, result)
  return result
}

// ---------------------------------------------------------------------------
// Daily membership series
// ---------------------------------------------------------------------------
// `DashboardWindow.series` is capped at 30 points because the "Activity over time"
// chart only has room for that many ticks. The Overview's four stat cards each
// carry a sparkline across the *whole* selected range, so a 12-week (84-day)
// window needs 84 bars -- and three of the four series it plots (roster, joined,
// left) are not in `series` at all. Bucketing separately keeps the line chart's
// tick budget intact instead of widening a series that already has a documented cap.
//
// Buckets use the same half-open `(from, to]` convention as `membershipFlow`, and
// each bucket's roster is measured at its closing boundary with `presentAt`, so
// the final point equals `DashboardWindow.totalMembers` exactly: the sparkline
// ends on the same number the stat card above it shows.

export interface MembershipPoint { label: string; date: string; roster: number; active: number; joined: number; left: number }
const membershipSeriesCache = new Map<string, MembershipPoint[]>()
export function membershipSeries(start: Date, end: Date): MembershipPoint[] {
  const cacheKey = `${start.getTime()}|${end.getTime()}`
  const hit = membershipSeriesCache.get(cacheKey)
  if (hit) return hit
  const humans = members.filter(m => !m.bot)
  const buckets = Math.max(1, Math.round((end.getTime() - start.getTime()) / day))
  const out: MembershipPoint[] = []
  for (let i = 0; i < buckets; i++) {
    const s = new Date(start.getTime() + i * day)
    // The last bucket closes on `end` rather than on the next midnight, so a
    // partial trailing day is still counted and the closing roster reconciles
    // with the "Total members" stat.
    const close = i === buckets - 1 ? end : new Date(s.getTime() + day)
    const sMs = s.getTime(), cMs = close.getTime()
    out.push({
      label: `${s.getUTCMonth() + 1}/${s.getUTCDate()}`,
      date: `${monthNames[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}`,
      roster: humans.filter(m => presentAt(m, close)).length,
      active: activeIds(s, close).size,
      joined: humans.filter(m => m.joinedAt.getTime() > sMs && m.joinedAt.getTime() <= cMs).length,
      left: humans.filter(m => m.leftAt !== null && m.leftAt.getTime() > sMs && m.leftAt.getTime() <= cMs).length,
    })
  }
  membershipSeriesCache.set(cacheKey, out)
  return out
}

// ---------------------------------------------------------------------------
// Canonical 28-day retention, by tenure cohort
// ---------------------------------------------------------------------------
// Retention is measured over fixed 28-day windows wherever it appears (the
// Engagement headline + cohort chart, the Overview insights + lead story): the
// percentage of members who were active during the previous 28-day period,
// were still on the server at the start of the current 28-day period, and
// became active again during the current 28-day period. The date picker only
// moves the observation point (`end`), never the window length, so the figure
// means the same thing on every page and at every range.
//
// The cohort chart decomposes that same rate by tenure at the window boundary:
// "New (<28 days)" on the server, "28-90 days", "90-180 days", plus the
// all-members totals every cohort is drawn from. The tenure cutoffs mirror the
// 28-day window so "New" always means "joined inside one retention window".
export interface RetentionPoint { label: string; date: string; all: number; new28: number; m30: number; m90: number }
export interface RetentionCohorts { all: number; new28: number; m30: number; m90: number }
const retentionPairCache = new Map<number, { denom: RetentionCohorts; num: RetentionCohorts }>()
// Everyone active in the 28 days before `windowEndMs - 28d` who was still on
// the roster at that boundary (the eligible returners), and how many of them
// were active again in the 28 days ending at `windowEndMs` -- split by tenure
// at the boundary. Shared by the headline, the cohort chart and the dashboard
// window so all three can never disagree.
function retentionPair(windowEndMs: number) {
  const hit = retentionPairCache.get(windowEndMs)
  if (hit) return hit
  const boundary = new Date(windowEndMs - 28 * day)
  const prev = activeIds(new Date(windowEndMs - 56 * day), boundary)
  const cur = activeIds(boundary, new Date(windowEndMs))
  const rosterById = new Map(members.map(m => [m.id, m]))
  const denom = { all: 0, new28: 0, m30: 0, m90: 0 }, num = { all: 0, new28: 0, m30: 0, m90: 0 }
  for (const id of prev) {
    const m = rosterById.get(id)
    if (!m || !presentAt(m, boundary)) continue
    const tenure = boundary.getTime() - m.joinedAt.getTime()
    const cohort: keyof typeof denom = tenure < 28 * day ? 'new28' : tenure < 90 * day ? 'm30' : tenure < 180 * day ? 'm90' : 'all'
    denom.all++; if (cohort !== 'all') denom[cohort]++
    if (cur.has(id)) { num.all++; if (cohort !== 'all') num[cohort]++ }
  }
  const out = { denom, num }
  retentionPairCache.set(windowEndMs, out)
  return out
}
const retentionRateOf = (n: number, d: number) => d ? n / d * 100 : 0
// The trailing-28-day headline and its pp change against the previous 28-day
// pair. With no prior history the change reads flat rather than grace-less.
export function retentionHeadline(end: Date): { current: number; prior: number; delta: number; returned: number; eligible: number } {
  const pair = retentionPair(end.getTime())
  const priorPair = retentionPair(end.getTime() - 28 * day)
  const current = retentionRateOf(pair.num.all, pair.denom.all)
  const prior = priorPair.denom.all ? retentionRateOf(priorPair.num.all, priorPair.denom.all) : current
  return { current, prior, delta: current - prior, returned: pair.num.all, eligible: pair.denom.all }
}
const retentionSeriesCache = new Map<number, RetentionPoint[]>()
export function retentionSeries(end: Date): RetentionPoint[] {
  const endMs = end.getTime()
  const hit = retentionSeriesCache.get(endMs)
  if (hit) return hit
  const out: RetentionPoint[] = []
  for (let i = 5; i >= 0; i--) {
    const t = new Date(endMs - i * 30 * day)
    const { denom, num } = retentionPair(t.getTime())
    out.push({
      label: monthNames[t.getMonth()],
      date: `${monthNames[t.getMonth()]} ${t.getUTCDate()}, ${t.getUTCFullYear()}`,
      all: retentionRateOf(num.all, denom.all),
      new28: retentionRateOf(num.new28, denom.new28),
      m30: retentionRateOf(num.m30, denom.m30),
      m90: retentionRateOf(num.m90, denom.m90),
    })
  }
  retentionSeriesCache.set(endMs, out)
  return out
}

// ---------------------------------------------------------------------------
// Weekly new-member activation
// ---------------------------------------------------------------------------
// The New member activation card plots the activation rate (joiners who were
// still present and active within 7 days of joining) for the five most recent
// fully observed calendar weeks. The activation window stays fixed at 7 days
// after joining; only fully eligible members -- whose complete 7-day window
// has elapsed -- are ever counted.
//
// The weeks walk BACKWARD from the Sunday starting the week containing `end`.
// A join week [s, s+7d) is plotted only when every joiner's window ends on or
// before `end` (s + 14d <= endMs); with the Sunday anchor that is always the
// weeks k = 2..6. The partial trailing week is omitted rather than plotted as
// 0%: a cohort whose window has not elapsed is pending, not failed. A week
// with no joiners at all plots as null (a gap in the line, "no new members" in
// the tooltip) rather than a 0% collapse that never happened.
export interface ActivationPoint { label: string; date: string; rate: number | null }
const activationSeriesCache = new Map<number, ActivationPoint[]>()
export function activationSeries(end: Date): ActivationPoint[] {
  const endMs = end.getTime()
  const hit = activationSeriesCache.get(endMs)
  if (hit) return hit
  const sunday = endMs - end.getUTCDay() * day
  const out: ActivationPoint[] = []
  for (let k = 6; k >= 2; k--) {
    const s = new Date(sunday - k * 7 * day), e = new Date(s.getTime() + 7 * day)
    const joiners = members.filter(m => !m.bot && m.joinedAt.getTime() > s.getTime() && m.joinedAt.getTime() <= e.getTime())
    const activated = joiners.filter(m => { const w = new Date(m.joinedAt.getTime() + 7 * day); return presentAt(m, w) && isActive(m.id, m.joinedAt, w) }).length
    const lastDay = new Date(e.getTime() - day)
    const startLabel = `${monthNames[s.getUTCMonth()]} ${s.getUTCDate()}`
    out.push({
      label: lastDay.getUTCMonth() === s.getUTCMonth() ? `${startLabel} - ${lastDay.getUTCDate()}` : `${startLabel} - ${monthNames[lastDay.getUTCMonth()]} ${lastDay.getUTCDate()}`,
      date: `${monthNames[s.getUTCMonth()]} ${s.getUTCDate()} – ${monthNames[lastDay.getUTCMonth()]} ${lastDay.getUTCDate()}, ${lastDay.getUTCFullYear()}`,
      rate: joiners.length ? activated / joiners.length * 100 : null,
    })
  }
  activationSeriesCache.set(endMs, out)
  return out
}

// ---------------------------------------------------------------------------
// Members to watch
// ---------------------------------------------------------------------------
// The card surfaces the five members whose engagement shifted most within the
// selected period. Every member is scored on the meaningful signals below
// (tier movement, relative message volume, sustained inactivity, return from
// inactivity, channel breadth, replies & reactions, and strong newcomers).
// Notability is saturable: the member's strongest story carries the score and
// a second corroborating signal adds only a modest bump, so several facets of
// one underlying change (a silence, a comeback) never stack into a runaway
// total. Staying-silent and coming-back stories are also scaled by how long
// they lasted, so a 14-day pause ranks below a 46-day one. Rows are ranked by
// that score and the top five are taken regardless of sign, each showing one
// concise direction + magnitude story; the headline is never allowed to
// repeat more than twice so the card cannot become a wall of identical rows.
// Each row carries either a tier move (from/to, rendered by the page as two
// tier pills: "Moved from Contributor to Lurker") or a plain text headline;
// the direction arrow is drawn by the page, so no glyphs live in these
// strings.
// Tier movement is measured on the app-wide trailing-28-day tiers so the rows
// never contradict the People page or a member profile. Selection is
// deterministic, so the list is stable across reloads.
export interface MemberWatchRow { id: string; name: string; handle: string; tier: ActivityTier; direction: 'up' | 'down'; kind: 'tier' | 'metric'; from?: ActivityTier; to?: ActivityTier; text?: string; score: number }
const membersToWatchCache = new Map<string, MemberWatchRow[]>()
const memberTierRank: Record<ActivityTier, number> = { Inactive: 0, Lurker: 1, Regular: 2, Contributor: 3, Superuser: 4 }
export function membersToWatch(start: Date, end: Date): MemberWatchRow[] {
  const startMs = start.getTime(), endMs = end.getTime()
  const key = `${startMs}|${endMs}`
  const hit = membersToWatchCache.get(key)
  if (hit) return hit
  ensureIndex()
  const lengthMs = Math.max(1, endMs - startMs)
  const priorMs = startMs - Math.round(lengthMs / day) * day
  // Per-member window tallies. Split in a single pass over the corpus so the
  // two windows (the selected period vs the equally-long period before it)
  // share one deterministic view of every signal.
  const cur = { msgs: new Map<string, number>(), intx: new Map<string, number>(), ch: new Map<string, Set<string>>(), days: new Map<string, Set<string>>() }
  const prior = { msgs: new Map<string, number>(), intx: new Map<string, number>(), ch: new Map<string, Set<string>>(), days: new Map<string, Set<string>>() }
  const bump = (bag: typeof cur, id: string, t: number, hasReply: boolean, reactions: number, channelId: string) => {
    bag.msgs.set(id, (bag.msgs.get(id) ?? 0) + 1)
    bag.intx.set(id, (bag.intx.get(id) ?? 0) + (hasReply ? reactions + 1 : reactions))
    let ch = bag.ch.get(id); if (!ch) { ch = new Set(); bag.ch.set(id, ch) }
    ch.add(channelId)
    let d = bag.days.get(id); if (!d) { d = new Set(); bag.days.set(id, d) }
    d.add(new Date(t).toDateString())
  }
  for (const x of messages) {
    const t = x.at.getTime()
    if (t >= startMs && t <= endMs) bump(cur, x.memberId, t, x.hasReply, x.reactions, x.channelId)
    else if (t >= priorMs && t <= startMs) bump(prior, x.memberId, t, x.hasReply, x.reactions, x.channelId)
  }
  // Voice and reactions-sent are activity too, exactly as the tier activeDays
  // count them; identical event day stamps collapse into the same set.
  for (const [id, ev] of eventsByMember) {
    for (const t of ev) {
      if (t >= startMs && t <= endMs) { let d = cur.days.get(id); if (!d) { d = new Set(); cur.days.set(id, d) } d.add(new Date(t).toDateString()) }
      else if (t >= priorMs && t <= startMs) { let d = prior.days.get(id); if (!d) { d = new Set(); prior.days.set(id, d) } d.add(new Date(t).toDateString()) }
    }
  }
  const lastEventBefore = (id: string, refMs: number): number => {
    const ev = eventsByMember.get(id)
    if (!ev || !ev.length || ev[0] >= refMs) return -Infinity
    let lo = 0, hi = ev.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (ev[mid] < refMs) lo = mid + 1; else hi = mid }
    return ev[lo - 1]
  }
  const lastEventOf = (id: string): number => {
    const ev = eventsByMember.get(id)
    return ev && ev.length ? ev[ev.length - 1] : -Infinity
  }
  const tierNow = activityTiers(end)
  const tierPrevAsOf = endMs - 28 * day
  const tierPrev = activityTiers(new Date(tierPrevAsOf))
  type WatchStory = 'tier' | 'volume' | 'inactive' | 'return' | 'channels' | 'interactions' | 'newcomer'
  type Signal = { direction: 'up' | 'down'; sub: number; kind: WatchStory; text?: string; from?: ActivityTier; to?: ActivityTier }
  type Candidate = { row: MemberWatchRow; story: WatchStory }
  const candidates: Candidate[] = []
  for (const m of members) {
    if (m.bot || !presentAt(m, end)) continue
    const cm = cur.msgs.get(m.id) ?? 0, pm = prior.msgs.get(m.id) ?? 0
    const cd = cur.days.get(m.id)?.size ?? 0, pd = prior.days.get(m.id)?.size ?? 0
    const nowTier = tierNow.get(m.id) ?? 'Inactive'
    const signals: Signal[] = []
    // 1. Tier movement on the trailing-28-day tiers.
    if (nowTier !== 'Inactive' && presentAt(m, new Date(tierPrevAsOf))) {
      const prevTier = tierPrev.get(m.id) ?? 'Inactive'
      const delta = memberTierRank[nowTier] - memberTierRank[prevTier]
      if (delta !== 0) signals.push({ direction: delta > 0 ? 'up' : 'down', kind: 'tier', sub: Math.abs(delta) >= 2 ? 30 : 22, from: prevTier, to: nowTier })
    }
    // 2. Relative message volume against the equally-long prior period.
    if (pm >= 2 && cm >= 8 && cm >= pm * 2) {
      const ratio = cm / pm
      signals.push({ direction: 'up', kind: 'volume', sub: 18 + Math.min(10, Math.round((ratio - 2) * 3)), text: `Activity increased ${Math.min(9.9, ratio).toFixed(1)}×` })
    } else if (pm >= 5 && cm >= 1 && cm <= pm * 0.5) {
      const ratio = cm / pm
      signals.push({ direction: 'down', kind: 'volume', sub: 18 + Math.min(8, Math.round((0.5 - ratio) * 40)), text: `Activity down ${Math.round((1 - ratio) * 100)}%` })
    }
    // 3. Sustained inactivity: active in the prior period, silent ever since.
    if (!cd && pd >= 1) {
      const idle = Math.round((endMs - lastEventOf(m.id)) / day)
      if (idle >= 14) signals.push({ direction: 'down', kind: 'inactive', sub: 20 + Math.min(16, idle - 14), text: `No activity for ${idle} days` })
    }
    // 4. Return from inactivity: gone two weeks or more, active again now.
    if (cd >= 2) {
      const gap = Math.round((startMs - lastEventBefore(m.id, startMs)) / day)
      if (gap >= 14) signals.push({ direction: 'up', kind: 'return', sub: 16 + Math.min(18, gap - 14), text: `Returned after ${Math.min(60, gap)} days inactive` })
    }
    // 5. Channel breadth shift (first-timers belong to the newcomer signal).
    const cb = cur.ch.get(m.id)?.size ?? 0, pb = prior.ch.get(m.id)?.size ?? 0
    if (pb >= 1 && cb - pb >= 3) signals.push({ direction: 'up', kind: 'channels', sub: 12 + Math.min(10, (cb - pb - 3) * 2), text: `Active in ${cb} channels, up from ${pb}` })
    else if (pb >= 3 && cb >= 1 && pb - cb >= 3) signals.push({ direction: 'down', kind: 'channels', sub: 12 + Math.min(10, (pb - cb - 3) * 2), text: `Active in ${cb} channels, down from ${pb}` })
    // 6. Meaningful interactions (replies + reactions received).
    const ci = cur.intx.get(m.id) ?? 0, pi = prior.intx.get(m.id) ?? 0
    if (pi >= 2 && ci >= pi * 2) {
      const ratio = ci / pi
      signals.push({ direction: 'up', kind: 'interactions', sub: 10 + Math.min(8, Math.round((ratio - 2) * 2)), text: `Replies & reactions ${Math.min(9.9, ratio).toFixed(1)}×` })
    } else if (pi >= 5 && ci >= 1 && ci <= pi * 0.5) {
      const ratio = ci / pi
      signals.push({ direction: 'down', kind: 'interactions', sub: 10 + Math.min(6, Math.round((0.5 - ratio) * 30)), text: `Replies & reactions down ${Math.round((1 - ratio) * 100)}%` })
    }
    // 7. Strong newcomer: no prior baseline, joined recently and started hot.
    if (pd === 0 && m.joinedAt.getTime() >= startMs - 14 * day && cm >= 6 && cd >= 3) {
      signals.push({ direction: 'up', kind: 'newcomer', sub: 20, text: `New member, ${cm} messages` })
    }
    if (!signals.length) continue
    // Notability: the member's strongest story, plus a modest bump when a second
    // corroborating signal confirms it. Signals describing the same underlying
    // change (a silence, a comeback) must not stack into a runaway total, so the
    // largest carries the weight and the rest only corroborate.
    const sorted = signals.slice().sort((a, b) => b.sub - a.sub)
    const score = sorted[0].sub + (sorted[1] ? Math.min(10, Math.round(sorted[1].sub * 0.4)) : 0)
    if (score < 15) continue
    const top = sorted[0]
    const base = { id: m.id, name: m.name, handle: m.username ?? m.name.toLowerCase().replace(/[^a-z0-9]+/g, '.'), tier: nowTier, direction: top.direction, score }
    candidates.push(top.kind === 'tier'
      ? { story: 'tier', row: { ...base, kind: 'tier' as const, from: top.from, to: top.to } }
      : { story: top.kind, row: { ...base, kind: 'metric' as const, text: top.text } })
  }
  candidates.sort((a, b) => b.row.score - a.row.score || a.row.id.localeCompare(b.row.id))
  // Headline variety guard: staying-silent and coming-back stories may fill the
  // card on their own, so their headline type is capped at two rows each while
  // everything else competes purely on score in rank order.
  const rows: MemberWatchRow[] = []
  const slots = new Map<WatchStory, number>()
  for (const c of candidates) {
    if (rows.length >= 5) break
    if (c.story === 'inactive' || c.story === 'return') {
      const used = slots.get(c.story) ?? 0
      if (used >= 2) continue
      slots.set(c.story, used + 1)
    }
    rows.push(c.row)
  }
  membersToWatchCache.set(key, rows)
  return rows
}

// ---------------------------------------------------------------------------
// Clock labels for peak windows ("7:00AM", "8:00PM")
// ---------------------------------------------------------------------------
export const clockLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}:00${h < 12 ? 'AM' : 'PM'}`