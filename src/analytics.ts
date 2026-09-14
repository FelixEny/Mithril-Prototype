import { channels, conversations, endDate, members, messages, voiceSessions, type Message, type VoiceSession } from './data'
export type RangeDays = 7 | 14 | 30 | 90
const day = 86400000; const unique = <T,>(items: T[]) => new Set(items)
const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
export const formatNumber = (value: number) => new Intl.NumberFormat('en-US', { notation: value > 9999 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
export const formatPercent = (value: number) => `${Math.round(value)}%`
// Heatmap intensity levels. Counts are "messages per week" for a weekday/hour
// cell (heat is normalized by lengthDays/7), so these are absolute thresholds
// independent of the selected range.
const heatBounds = [6, 15, 30, 50, 80, 130]
export const heatLevel = (count: number) => {
  for (let i = 0; i < heatBounds.length; i++) if (count <= heatBounds[i]) return i + 1
  return 7
}
// Active-members heat uses the same 7-step green scale but member counts run
// lower than message counts, so it has its own absolute bounds (average unique
// active members for a weekday/hour cell across its occurrences in the window).
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
    for (const rid of x.reactorIds) push(eventsByMember, rid, x.at.getTime())
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
  const scored = members.filter(m => !m.bot).map(m => {
    const own = (messagesByMember.get(m.id) ?? []).filter(x => x.at >= cutoff)
    const voice = (voiceByMember.get(m.id) ?? []).filter(x => x.at >= cutoff)
    const activeDays = unique([...own.map(x => x.at.toDateString()), ...voice.map(x => x.at.toDateString())]).size
    const breadth = unique(own.map(x => x.channelId)).size
    const interactions = own.reduce((n, x) => n + (x.hasReply ? 1 : 0) + x.reactions, 0)
    return { id: m.id, activeDays, score: activeDays * .5 + Math.log1p(own.length) * 2 + Math.log1p(interactions) + breadth }
  }).sort((a, b) => b.score - a.score)
  const actives = scored.filter(x => x.activeDays > 0)
  const out = new Map<string, ActivityTier>()
  for (const [i, m] of scored.entries()) {
    out.set(m.id, !m.activeDays ? 'Inactive' : i < Math.ceil(actives.length * .05) ? 'Superuser' : i < Math.ceil(actives.length * .2) ? 'Contributor' : m.activeDays >= 5 ? 'Regular' : 'Lurker')
  }
  tierCache.set(endMs, out)
  return out
}

export function dashboard(days: RangeDays) {
  return dashboardWindow(new Date(endDate.getTime() - days * day), endDate)
}
export function dashboardWindow(start: Date, end: Date) {
  const lengthDays = (end.getTime() - start.getTime()) / day, previousStart = new Date(start.getTime() - lengthDays * day)
  const periodMessages = messages.filter(x => x.at >= start && x.at <= end), periodVoice = voiceSessions.filter(x => x.at >= start && x.at <= end), active = activeIds(start, end), prior = activeIds(previousStart, start)
  const eligible = members.filter(m => !m.bot && m.joinedAt >= start && m.joinedAt <= new Date(end.getTime() - 7 * day)); const activated = eligible.filter(m => isActive(m.id, m.joinedAt, new Date(m.joinedAt.getTime() + 7 * day))).length
  const eligiblePrior = members.filter(m => !m.bot && m.joinedAt >= previousStart && m.joinedAt <= new Date(start.getTime() - 7 * day)); const activatedPrior = eligiblePrior.filter(m => isActive(m.id, m.joinedAt, new Date(m.joinedAt.getTime() + 7 * day))).length
  const prior2 = activeIds(new Date(previousStart.getTime() - lengthDays * day), previousStart)
  const voiceIds = unique(periodVoice.map(x => x.memberId)), messageIds = unique(periodMessages.map(x => x.memberId)), totalMembers = members.filter(x => !x.bot).length
  const activeRate = active.size / totalMembers * 100, priorRate = prior.size / totalMembers * 100, activationRate = eligible.length ? activated / eligible.length * 100 : 0, priorActivation = eligiblePrior.length ? activatedPrior / eligiblePrior.length * 100 : 0, retentionRate = prior.size ? [...prior].filter(id => active.has(id)).length / prior.size * 100 : 0, priorRetention = prior2.size ? [...prior2].filter(id => prior.has(id)).length / prior2.size * 100 : retentionRate, returned = [...prior].filter(id => active.has(id)).length
  const current = { active: active.size, activeRate, activation: activationRate, retention: retentionRate, messages: periodMessages.length, replyRate: periodMessages.filter(x => x.hasReply).length / Math.max(1, periodMessages.length) * 100, reactionRate: periodMessages.filter(x => x.reactions > 0).length / Math.max(1, periodMessages.length) * 100, voice: voiceIds.size, voiceMinutes: periodVoice.reduce((n, x) => n + x.minutes, 0), voiceOnly: [...voiceIds].filter(x => !messageIds.has(x)).length }
  const visibleDays = Math.min(Math.round(lengthDays), 30); const series = Array.from({ length: visibleDays }, (_, i) => { const s = new Date(end.getTime() - (visibleDays - i) * day), e = new Date(s.getTime() + day), rows = periodMessages.filter(x => x.at >= s && x.at < e); return { label: `${s.getUTCMonth()+1}/${s.getUTCDate()}`, date: `${monthNames[s.getUTCMonth()]} ${s.getUTCDate()}, ${s.getUTCFullYear()}`, messages: rows.length, active: activeIds(s, e).size, voice: unique(periodVoice.filter(x => x.at >= s && x.at < e).map(x => x.memberId)).size } })
  const tierMap = activityTiers(end); const tiers = TIERS.map(tier => ({ tier, value: [...tierMap.values()].filter(t => t === tier).length }))
  // Per-weekday occurrence counts in [start, end]: a window rarely holds whole
  // weeks (30d covers Sun/Mon 5x but Tue-Sat 4x; custom ranges vary more), so
  // each weekday row is divided by its own occurrence count rather than a
  // uniform lengthDays/7. Fractional occurrences come from walking the window
  // hour by hour, which also absorbs partial edge days. Each cell value is the
  // average for that weekday/hour across its occurrences in the window.
  const weekdayHours = [0, 0, 0, 0, 0, 0, 0]
  for (let t = start.getTime(); t < end.getTime(); t += 3600000) weekdayHours[(new Date(t).getUTCDay() + 6) % 7]++
  const weekdayOcc = weekdayHours.map((h) => Math.max(h / 24, 1 / 24))
  const heat = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => ({ weekday, hour, count: periodMessages.filter(x => x.at.getUTCDay() === (weekday + 1) % 7 && x.at.getUTCHours() === hour).length / weekdayOcc[weekday] })))
  const heatActive = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => {
    const ids = new Set<string>()
    for (const x of periodMessages) if (x.at.getUTCDay() === (weekday + 1) % 7 && x.at.getUTCHours() === hour) { ids.add(x.memberId); for (const r of x.reactorIds) ids.add(r) }
    for (const v of periodVoice) if (v.at.getUTCDay() === (weekday + 1) % 7 && v.at.getUTCHours() === hour) ids.add(v.memberId)
    return { weekday, hour, count: ids.size / weekdayOcc[weekday] }
  }))
  const peak = heat.flat().reduce((a,b) => a.count > b.count ? a : b); const baseline = periodMessages.length / Math.max(1, lengthDays * 24); const peakBlocks: { weekday: number; minHour: number; maxHour: number; cells: { weekday: number; hour: number; count: number }[] }[] = []; for (const cell of heat.flat().filter(x => x.count > 0).sort((a,b) => b.count - a.count).slice(0, 6)) { let placed = false; for (const b of peakBlocks) { if (b.weekday !== cell.weekday) continue; if (cell.hour === b.maxHour + 1) { b.maxHour = cell.hour; b.cells.push(cell); placed = true; break } if (cell.hour === b.minHour - 1) { b.minHour = cell.hour; b.cells.push(cell); placed = true; break } } if (!placed && peakBlocks.length < 3) peakBlocks.push({ weekday: cell.weekday, minHour: cell.hour, maxHour: cell.hour, cells: [cell] }) } const peaks = peakBlocks.map(b => { const top = b.cells.reduce((a,c) => a.count > c.count ? a : c), sum = b.cells.reduce((n,c) => n + c.count, 0); return { weekday: b.weekday, minHour: b.minHour, maxHour: b.maxHour, peak: top, avg: sum / b.cells.length, sum, magnitude: top.count / Math.max(1, baseline) } }).sort((a,b) => b.peak.count - a.peak.count || b.sum - a.sum)
  const channelRows = channels.map(c => ({ ...c, messages: periodMessages.filter(x => x.channelId === c.id).length, active: unique(periodMessages.filter(x => x.channelId === c.id).map(x => x.memberId)).size })).sort((a,b)=>b.messages-a.messages)
  const discussionRows = conversations.map(c => { const items = periodMessages.filter(x => x.conversationId === c.id), recent = items.filter(x => x.at >= new Date(end.getTime()-3*3600000)), priorItems = items.filter(x => x.at >= new Date(end.getTime()-27*3600000) && x.at < new Date(end.getTime()-3*3600000)), velocity = recent.reduce((n,x)=>n+(x.hasReply?1:0)+x.reactions*.5,0)+unique(recent.map(x=>x.memberId)).size, baseline = (priorItems.reduce((n,x)=>n+(x.hasReply?1:0)+x.reactions*.5,0)+unique(priorItems.map(x=>x.memberId)).size)/8, avatars = [...recent].sort((a,b)=>b.at.getTime()-a.at.getTime()).reduce((map,x)=>map.has(x.memberId)?map:map.set(x.memberId,(members.find(m=>m.id===x.memberId)?.name ?? x.memberId)),new Map<string,string>()); return { ...c, channel: channels.find(x=>x.id===c.channelId)!.name, replies: recent.filter(x=>x.hasReply).length, reactions: recent.reduce((n,x)=>n+x.reactions,0), participants: unique(recent.map(x=>x.memberId)).size, avatars: [...avatars].slice(0,3).map(([id,name])=>({id,name})), score: velocity / (baseline || 1) } }).sort((a,b)=>b.score-a.score)
  const priorMessages = messages.filter(x => x.at >= previousStart && x.at < start), priorVoice = voiceSessions.filter(x => x.at >= previousStart && x.at < start), priorReplyRate = priorMessages.filter(x => x.hasReply).length / Math.max(1, priorMessages.length) * 100, priorReactionRate = priorMessages.filter(x => x.reactions > 0).length / Math.max(1, priorMessages.length) * 100, priorVoiceIds = unique(priorVoice.map(x => x.memberId)).size, priorVoiceMinutes = priorVoice.reduce((n, x) => n + x.minutes, 0)
  const delta = { active: prior.size ? (active.size - prior.size) / prior.size * 100 : 0, activeRate: activeRate - priorRate, activation: activationRate - priorActivation, retention: retentionRate - priorRetention, messages: priorMessages.length ? (periodMessages.length - priorMessages.length) / priorMessages.length * 100 : 0, replyRate: current.replyRate - priorReplyRate, reactionRate: current.reactionRate - priorReactionRate, voice: priorVoiceIds ? (voiceIds.size - priorVoiceIds) / priorVoiceIds * 100 : 0, voiceMinutes: priorVoiceMinutes ? (current.voiceMinutes - priorVoiceMinutes) / priorVoiceMinutes * 100 : 0 }
  return { start, end, current, totalMembers, delta, activation: { activated, eligible: eligible.length }, retention: { returned, prior: prior.size }, series, tiers, heat, heatActive, peak, peaks, baseline, channelRows, discussionRows }
}