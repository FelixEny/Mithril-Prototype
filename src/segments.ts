import { members, endDate, presentAt, segments, type Member, type Segment, type SegmentCriteria } from './data'
import { activitySnapshot, type ActivitySnapshot } from './analytics'
import { influenceEngine } from './relationships'

const day = 86400000
const save = (items: Segment[]) => { try { localStorage.setItem('mithril.segments.v1', JSON.stringify(items)) } catch { /* prototype: ignore storage errors */ } }
const loadSaved = (): Segment[] => {
  try {
    const raw = localStorage.getItem('mithril.segments.v1')
    return raw ? (JSON.parse(raw) as Segment[]) : []
  } catch { return [] }
}

export function userSegments(): Segment[] { return loadSaved() }
export function allSegments(): Segment[] { return [...segments, ...loadSaved()] }
export function createSegment(seg: Omit<Segment, 'id' | 'builtIn'>): Segment {
  const item: Segment = { ...seg, id: `seg_user_${Math.random().toString(36).slice(2, 9)}`, builtIn: false }
  const next = [...loadSaved(), item]
  save(next)
  return item
}
export function updateSegment(id: string, patch: Partial<Omit<Segment, 'id' | 'builtIn'>>): void { save(loadSaved().map((s) => (s.id === id ? { ...s, ...patch } : s))) }
export function upsertSegment(seg: Segment): void {
  const saved = loadSaved()
  save(saved.some((s) => s.id === seg.id) ? saved.map((s) => (s.id === seg.id ? seg : s)) : [...saved, seg])
}
export function deleteSegment(id: string): void { save(loadSaved().filter((s) => s.id !== id)) }

// Evaluate one dynamic segment's criteria against the per-member activity
// snapshot as of `asOf`. Bots and members who had already left at `asOf` never
// qualify: a saved list of "who's in this segment" must describe the roster as it
// stood, and members cannot leave a segment they are no longer in. Membership is
// computed, never stored, so a saved filter stays live: members can enter or
// leave as their activity, join and departure dates move relative to `asOf`.
export function segmentMembership(seg: Segment, asOf: Date = endDate): string[] {
  if (seg.kind === 'static') {
    const valid = new Set(members.filter((m) => presentAt(m, asOf)).map((m) => m.id))
    return (seg.memberIds ?? []).filter((id) => valid.has(id))
  }
  const criteria = seg.criteria ?? {}
  const snap = activitySnapshot(asOf)
  const asOfMs = asOf.getTime()
  const inf = influenceMap(asOf)
  return members.filter((m) => presentAt(m, asOf) && matchesCriteria(m, criteria, snap, asOfMs, inf)).map((m) => m.id)
}

// Influence scores for every member, matching the People page rows: engine
// score when present, otherwise a small activity-derived fallback.
function influenceMap(asOf: Date): Map<string, number> {
  const network = influenceEngine().memberInfo
  const wrap = (s?: ActivitySnapshot) => (s ? Math.min(22, Math.round(Math.log1p(s.messages) * 2 + Math.log1p(s.reactionsReceived) + Math.log1p(s.voiceMinutes / 60) + s.activeDays * 0.3)) : 0)
  const snap = activitySnapshot(asOf)
  return new Map(members.filter((m) => !m.bot).map((m) => [m.id, Math.round(network.get(m.id)?.influence ?? wrap(snap.get(m.id)))]))
}

function matchesCriteria(m: Member, c: SegmentCriteria, snap: Map<string, ActivitySnapshot>, asOfMs: number, inf: Map<string, number>): boolean {
  // joinedAt is already <= asOf via presentAt, but the criteria engine is also
  // reachable from the People page filter builder, so keep the explicit guard.
  if (m.joinedAt.getTime() > asOfMs) return false
  if (c.archetypes && c.archetypes.length && !(m.archetype && c.archetypes.includes(m.archetype))) return false
  if (c.roles && c.roles.length && !c.roles.some((r) => m.roles?.includes(r))) return false
  if (c.joinedWithinDays !== undefined && m.joinedAt.getTime() < asOfMs - c.joinedWithinDays * day) return false
  if (c.joinedBeforeDays !== undefined && m.joinedAt.getTime() > asOfMs - c.joinedBeforeDays * day) return false
  const s = snap.get(m.id)
  if (!s) return false
  if (c.activityTier && c.activityTier.length && !c.activityTier.includes(s.tier)) return false
  if (c.activeWithinDays !== undefined && s.lastActiveAtMs < asOfMs - c.activeWithinDays * day) return false
  if (c.minMessagesWithinDays !== undefined && s.messages < c.minMessagesWithinDays) return false
  if (c.minInfluence !== undefined && (inf.get(m.id) ?? 0) < c.minInfluence) return false
  return true
}

export function segmentSize(seg: Segment, asOf: Date = endDate): number { return segmentMembership(seg, asOf).length }

// Members entering or leaving a (dynamic) segment between two "as of" points.
// The Overview page surfaces this for dynamic segments. `toAsOf` is typically
// the data end; `fromAsOf` steps one snapshot behind it.
export function segmentFlow(seg: Segment, fromAsOf: Date, toAsOf: Date): { joined: string[]; left: string[] } {
  const before = new Set(segmentMembership(seg, fromAsOf))
  const after = segmentMembership(seg, toAsOf)
  return { joined: after.filter((id) => !before.has(id)), left: [...before].filter((id) => !after.includes(id)) }
}

export function segmentHeads(seg: Segment, asOf: Date = endDate, limit = 4): { id: string; name: string }[] {
  const byId = new Map(members.map((m) => [m.id, m.name]))
  return segmentMembership(seg, asOf).slice(0, limit).map((id) => ({ id, name: byId.get(id) ?? id }))
}