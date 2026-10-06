import { endDate, members, messages, presentAt, replies, reactions, type Member } from './data'

export type StrengthLabel = 'strong' | 'mid' | 'weak'

export interface RelationshipEdge {
  a: string
  b: string
  count: number
  days: number
  weeks: number
  firstAt: number
  lastAt: number
  score: number
  label: StrengthLabel
}

export interface ClusterInfo {
  id: number
  size: number
  memberIds: string[]
}

export interface ConnectionBucket {
  label: string
  count: number
}

export interface RelationshipMix {
  strong: number
  mid: number
  weak: number
}

export interface MemberRelInfo {
  memberId: string
  name: string
  username: string | null
  degree: number
  mix: RelationshipMix
  lastActive: number
  joinedAt: number
  reach: number
  reachCount: number
  quality: number
  activity: number
  influence: number
  bridge: boolean
  clusterId: number
  mostConnected: boolean
}

export interface InfluencerRow {
  memberId: string
  name: string
  connections: number
  mix: RelationshipMix
  reach: number
  influence: number
  lastActive: number
  joinedAt: number
}

export interface RelationshipsData {
  start: number
  end: number
  totalMembers: number
  connectedCount: number
  connectedPct: number
  lessConnectedCount: number
  lessConnectedPct: number
  avgConnections: number
  totalLinks: number
  edges: RelationshipEdge[]
  degree: Map<string, number>
  strength: number
  strengthDelta: number
  connectedness: number
  participation: number
  distribution: number
  relationshipQuality: number
  buckets: ConnectionBucket[]
  clusters: ClusterInfo[]
  bridgeCount: number
  backbone: string[]
  influencers: InfluencerRow[]
  memberInfo: Map<string, MemberRelInfo>
  mostConnectedIds: string[]
  labelCounts: Record<StrengthLabel, number>
  linksDelta: number
  connectedDelta: number
  avgConnectionsDelta: number
}

export const strengthLabel = (score: number): StrengthLabel => (score >= STRONG_AT ? 'strong' : score >= MID_AT ? 'mid' : 'weak')
const qualityWeight = (label: StrengthLabel) => (label === 'strong' ? 100 : label === 'mid' ? 60 : 20)

// Relationship Strength calibration. The curves are tuned for a single basis
// window -- see STRENGTH_BASIS_DAYS below -- and must not be read on any other.
// On a 28-day window this corpus yields roughly 40% strong / 56% mid / 4% weak
// ties and a composite near 47/100. Keep the values in sync with
// scripts/verify-relationships.mjs.
const STRONG_AT = 70
const MID_AT = 40
const FREQ_K = 4

// The score's calibration window, in days.
//
// An edge only exists once a pair clears two interactions across two days, so
// every component is really a function of how long you watched: on this corpus
// connectedness runs 10.8 / 15.8 / 24.0 / 35.4 at 7 / 14 / 28 / 84 days.
// That is a measurement-window artifact, not the community changing, so the
// score is computed over a fixed length and the date picker's *length* must not
// reach it. The end still follows the picker, so a custom end date does move the
// score -- that is a genuine 28-day period and an equal-length comparison, the
// same thing strengthDelta already does.
//
// 28 rather than 30 to match the trailing-28-day activity snapshot the Overview
// donut reports. weeksIn = round(days/7) = 4 at both lengths, so the consistency
// term is unchanged by this choice.
export const STRENGTH_BASIS_DAYS = 28

const DAY = 86_400_000
const weekOf = (t: number) => new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)

interface BaseData {
  humans: Member[]
  humanSet: Set<string>
  memberName: Map<string, string>
  memberUsername: Map<string, string | null>
  memberJoined: Map<string, number>
  msgAuthor: Map<string, string>
}
let baseCache: BaseData | null = null
function ensureBase(): BaseData {
  if (baseCache) return baseCache
  // Network stats describe the community as it stands at the end of the data
  // window, so members who have left are excluded from the denominator. Leaving
  // them in would report a "less connected" population that includes people no
  // longer on the server, understating connectivity as the roster churns.
  const humans = members.filter((m) => presentAt(m, endDate))
  const humanSet = new Set(humans.map((m) => m.id))
  const memberName = new Map<string, string>()
  const memberUsername = new Map<string, string | null>()
  const memberJoined = new Map<string, number>()
  for (const m of humans) {
    memberName.set(m.id, m.name)
    memberUsername.set(m.id, m.username ?? null)
    memberJoined.set(m.id, m.joinedAt.getTime())
  }
  const msgAuthor = new Map(messages.map((m) => [m.id, m.memberId]))
  return (baseCache = { humans, humanSet, memberName, memberUsername, memberJoined, msgAuthor })
}

const PARTICIPATION_PORTION = 0.25

const pairKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)

interface CoreResult {
  edges: RelationshipEdge[]
  degree: Map<string, number>
  connectedCount: number
  connectedPct: number
  lessConnectedCount: number
  lessConnectedPct: number
  avgConnections: number
  totalLinks: number
  connectedness: number
  participation: number
  distribution: number
  relationshipQuality: number
  strength: number
  labelCounts: Record<StrengthLabel, number>
  buckets: ConnectionBucket[]
  clusters: ClusterInfo[]
  memberCluster: Map<string, number>
  bridges: Set<string>
  inbound: Map<string, Set<string>>
  activity: Map<string, number>
  lastSeen: Map<string, number>
}

function buildCore(start: number, end: number): CoreResult {
  const { humans, humanSet, msgAuthor } = ensureBase()
  const pairs = new Map<string, { a: string; b: string; count: number; days: Set<string>; weeks: Set<string>; firstAt: number; lastAt: number }>()
  const inbound = new Map<string, Set<string>>()
  const activity = new Map<string, number>()
  const lastSeen = new Map<string, number>()

  const touch = (a: string, b: string, t: number) => {
    if (a === b || !humanSet.has(a) || !humanSet.has(b)) return
    const k = pairKey(a, b)
    let acc = pairs.get(k)
    if (!acc) {
      acc = { a, b, count: 0, days: new Set(), weeks: new Set(), firstAt: t, lastAt: t }
      pairs.set(k, acc)
    }
    acc.count++
    acc.days.add(new Date(t).toDateString())
    acc.weeks.add(weekOf(t))
    if (t < acc.firstAt) acc.firstAt = t
    if (t > acc.lastAt) acc.lastAt = t
    let set = inbound.get(a)
    if (!set) { set = new Set(); inbound.set(a, set) }
    set.add(b)
    activity.set(a, (activity.get(a) ?? 0) + 1)
    activity.set(b, (activity.get(b) ?? 0) + 1)
    lastSeen.set(a, t)
    lastSeen.set(b, t)
  }

  for (const r of replies) {
    const t = r.at.getTime()
    if (t < start || t > end) continue
    const author = msgAuthor.get(r.messageId)
    if (author !== undefined) touch(author, r.memberId, t)
  }
  for (const r of reactions) {
    const t = r.at.getTime()
    if (t < start || t > end) continue
    const author = msgAuthor.get(r.messageId)
    if (author !== undefined) touch(author, r.memberId, t)
  }

  const edges: RelationshipEdge[] = []
  for (const acc of pairs.values()) {
    if (acc.count < 2 || acc.days.size < 2) continue
    const score = edgeScore(acc, start, end)
    edges.push({
      a: acc.a,
      b: acc.b,
      count: acc.count,
      days: acc.days.size,
      weeks: acc.weeks.size,
      firstAt: acc.firstAt,
      lastAt: acc.lastAt,
      score,
      label: strengthLabel(score),
    })
  }

  const degree = new Map<string, number>()
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1)
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1)
  }

  const totalMembers = humans.length
  const connectedCount = [...degree.values()].filter((d) => d >= 2).length
  const connectedPct = (connectedCount / totalMembers) * 100
  const lessConnectedCount = totalMembers - connectedCount
  const lessConnectedPct = 100 - connectedPct
  const totalLinks = edges.length
  const avgConnections = totalMembers > 0 ? totalLinks / totalMembers : 0
  const connectedness = connectedPct

  const partStart = end - (end - start) * PARTICIPATION_PORTION
  const connectedSet = new Set<string>()
  for (const [id, d] of degree) if (d >= 2) connectedSet.add(id)
  const maintained = new Set<string>()
  for (const e of edges) if (e.lastAt >= partStart) { maintained.add(e.a); maintained.add(e.b) }
  let maintainedConnected = 0
  for (const id of connectedSet) if (maintained.has(id)) maintainedConnected++
  const participation = connectedCount > 0 ? (maintainedConnected / connectedCount) * 100 : 0

  // gini()'s weighted-sum form is only valid on ascending input, so it has to be
  // sorted here -- humans are not in degree order, and passing the raw list made
  // the coefficient collapse to 0, pinning Distribution at a perfect 100.
  const degreeAll = humans.map((m) => degree.get(m.id) ?? 0).sort((a, b) => a - b)
  const distribution = Math.max(0, 100 * (1 - gini(degreeAll)))

  let qSum = 0
  const labelCounts: Record<StrengthLabel, number> = { strong: 0, mid: 0, weak: 0 }
  for (const e of edges) {
    qSum += qualityWeight(e.label)
    labelCounts[e.label]++
  }
  const relationshipQuality = edges.length > 0 ? qSum / edges.length : 0

  const strength = 0.35 * connectedness + 0.3 * participation + 0.2 * distribution + 0.15 * relationshipQuality

  const buckets = adaptiveBuckets(degree, humans)
  const { memberCluster, groups } = partitionClusters(edges)
  const clusters: ClusterInfo[] = [...groups.entries()]
    .filter(([, ids]) => ids.length >= 10)
    .sort((a, b) => b[1].length - a[1].length || (a[1][0] < b[1][0] ? -1 : 1))
    .map(([, ids], i) => ({ id: i, size: ids.length, memberIds: ids }))

  const surfaced = new Map<string, number>()
  clusters.forEach((c) => c.memberIds.forEach((id) => surfaced.set(id, c.id)))
  const memberClusterId = new Map<string, number>()
  for (const [id, c] of memberCluster) memberClusterId.set(id, surfaced.has(id) ? surfaced.get(id)! : -1)

  // A member is a bridge when their qualifying edges reach at least two
  // surfaced clusters OTHER than their own (size >= 2 on bridgeCandidates).
  const bridgeCandidates = new Map<string, Set<number>>()
  for (const e of edges) {
    const ma = memberClusterId.get(e.a) ?? -1
    const mb = memberClusterId.get(e.b) ?? -1
    if (ma !== -1 && mb !== -1 && mb !== ma) {
      let s = bridgeCandidates.get(e.a); if (!s) { s = new Set(); bridgeCandidates.set(e.a, s) }
      s.add(mb)
    }
    if (mb !== -1 && ma !== -1 && ma !== mb) {
      let s = bridgeCandidates.get(e.b); if (!s) { s = new Set(); bridgeCandidates.set(e.b, s) }
      s.add(ma)
    }
  }
  const bridges = new Set<string>()
  for (const [id, s] of bridgeCandidates) if (s.size >= 2) bridges.add(id)

  return {
    edges, degree, connectedCount, connectedPct, lessConnectedCount, lessConnectedPct,
    avgConnections, totalLinks, connectedness, participation, distribution,
    relationshipQuality, strength, labelCounts, buckets, clusters, memberCluster: memberClusterId,
    bridges, inbound, activity, lastSeen,
  }
}

function edgeScore(acc: { count: number; days: Set<string>; weeks: Set<string>; lastAt: number }, start: number, end: number) {
  const weeksIn = Math.max(1, Math.round((end - start) / (7 * DAY)))
  const freq = 100 * (1 - Math.exp(-acc.count / FREQ_K))
  const recency = 100 * Math.min(1, (acc.lastAt - start) / (end - start))
  const consistency = 100 * (0.65 * Math.min(1, acc.weeks.size / weeksIn) + 0.35 * Math.min(1, acc.days.size / 2.5))
  return 0.4 * freq + 0.3 * recency + 0.3 * consistency
}

function gini(sorted: number[]) {
  const n = sorted.length
  if (n === 0 || sorted[n - 1] === 0) return 0
  const sum = sorted.reduce((a, x) => a + x, 0)
  const weighted = sorted.reduce((a, x, i) => a + (i + 1) * x, 0)
  return Math.max(0, Math.min(1, (2 * weighted) / (n * sum) - (n + 1) / n))
}

function adaptiveBuckets(degree: Map<string, number>, humans: Member[]): ConnectionBucket[] {
  const degOf = (id: string) => degree.get(id) ?? 0
  const maxD = humans.reduce((a, m) => Math.max(a, degOf(m.id)), 0)
  const widths = [10, 20, 25, 50, 100, 250, 500]
  const w = widths.find((x) => (maxD + 1) / x <= 5) ?? 500
  const n = Math.max(1, Math.min(5, Math.ceil((maxD + 1) / w)))
  const out: ConnectionBucket[] = []
  for (let i = 0; i < n; i++) {
    const lo = i * w
    const last = i === n - 1
    const label = last ? `${lo}+` : `${lo} - ${lo + w}`
    const count = humans.filter((m) => { const d = degOf(m.id); return d >= lo && (last || d < lo + w) }).length
    out.push({ label, count })
  }
  return out
}

function partitionClusters(edges: RelationshipEdge[]): { memberCluster: Map<string, number>; groups: Map<number, string[]> } {
  const nodes = new Set<string>()
  for (const e of edges) { nodes.add(e.a); nodes.add(e.b) }
  const ids = [...nodes].sort()
  if (ids.length === 0) return { memberCluster: new Map(), groups: new Map() }
  const index = new Map<string, number>()
  ids.forEach((id, i) => index.set(id, i))

  const adj = new Map<number, Map<number, number>>()
  const deg = new Array(ids.length).fill(0)
  for (const e of edges) {
    const ia = index.get(e.a)!
    const ib = index.get(e.b)!
    let ma = adj.get(ia); if (!ma) { ma = new Map(); adj.set(ia, ma) }
    let mb = adj.get(ib); if (!mb) { mb = new Map(); adj.set(ib, mb) }
    ma.set(ib, (ma.get(ib) ?? 0) + 1)
    mb.set(ia, (mb.get(ia) ?? 0) + 1)
    deg[ia]++
    deg[ib]++
  }

  const m = edges.length // undirected edge count
  const community = new Array(ids.length).fill(0).map((_, i) => i)
  const commL = new Array(ids.length).fill(0)
  const commS = deg.slice()

  const edgesTo = (id: number, c: number) => {
    let k = 0
    for (const [nb, w] of adj.get(id) ?? []) if (community[nb] === c) k += w
    return k
  }

  const moveGain = (id: number, c: number, kC: number) => {
    const cur = community[id]
    if (c === cur) return 0
    const kD = edgesTo(id, cur)
    const kI = deg[id]
    const gain =
      ((commL[c] + kC) / m - ((commS[c] + kI) / (2 * m)) ** 2 - commL[c] / m + (commS[c] / (2 * m)) ** 2) +
      ((commL[cur] - kD) / m - ((commS[cur] - kI) / (2 * m)) ** 2 - commL[cur] / m + (commS[cur] / (2 * m)) ** 2)
    return gain
  }

  const order = ids.map((_, i) => i).sort((x, y) => deg[y] - deg[x] || x - y)

  for (let pass = 0; pass < 24; pass++) {
    let changed = false
    for (const id of order) {
      const cur = community[id]
      const candidates = new Set<number>([cur])
      for (const nb of adj.get(id)?.keys() ?? []) candidates.add(community[nb])
      let best = cur
      let bestGain = 0
      for (const c of candidates) {
        if (c === cur) continue
        const kC = edgesTo(id, c)
        const g = moveGain(id, c, kC)
        if (g > bestGain || (g === bestGain && c < best)) { best = c; bestGain = g }
      }
      if (best !== cur) {
        const kC = edgesTo(id, best)
        const kD = edgesTo(id, cur)
        const kI = deg[id]
        commL[best] += kC
        commS[best] += kI
        commL[cur] -= kD
        commS[cur] -= kI
        community[id] = best
        changed = true
      }
    }
    if (!changed) break
  }

  const memberCluster = new Map<string, number>()
  const groups = new Map<number, string[]>()
  for (let i = 0; i < ids.length; i++) {
    memberCluster.set(ids[i], community[i])
    const arr = groups.get(community[i]); if (arr) arr.push(ids[i]); else groups.set(community[i], [ids[i]])
  }
  return { memberCluster, groups }
}

const BACKBONE_MIN_EDGES = 400

// Default view of the graph: every bridge member, the most influential member
// of each surfaced cluster, then the rest ranked by influence until the chosen
// members hold at least BACKBONE_MIN_EDGES edges among themselves. This keeps
// the initial render small and fast while preserving structure and bridges.
export function selectBackbone(rel: RelationshipsData, filters: { cluster: number | null; minDegree: number | null }): string[] {
  const eligible: string[] = []
  for (const [id, mi] of rel.memberInfo) {
    if (mi.degree <= 0) continue
    if (filters.cluster !== null && mi.clusterId !== filters.cluster) continue
    if (filters.minDegree !== null && mi.degree < filters.minDegree) continue
    eligible.push(id)
  }
  if (eligible.length === 0) return []

  const set = new Set<string>()
  for (const id of eligible) if (rel.memberInfo.get(id)?.bridge) set.add(id)
  if (filters.cluster === null) {
    for (const c of rel.clusters) {
      let best: string | null = null
      let bestInf = -1
      for (const id of c.memberIds) {
        const mi = rel.memberInfo.get(id)
        if (!mi) continue
        const v = mi.influence
        if (v > bestInf || (v === bestInf && (best === null || id < best))) { bestInf = v; best = id }
      }
      if (best) set.add(best)
    }
  }

  let internal = 0
  for (const e of rel.edges) if (set.has(e.a) && set.has(e.b)) internal++
  const ranked = [...eligible].sort((a, b) => {
    const ia = rel.memberInfo.get(a)!.influence
    const ib = rel.memberInfo.get(b)!.influence
    return ib - ia || (a < b ? -1 : 1)
  })
  for (const id of ranked) {
    if (internal >= BACKBONE_MIN_EDGES) break
    if (set.has(id)) continue
    let gained = 0
    for (const e of rel.edges) {
      if ((e.a === id && set.has(e.b)) || (e.b === id && set.has(e.a))) gained++
    }
    set.add(id)
    internal += gained
  }
  return [...set].sort()
}

const cache = new Map<string, RelationshipsData>()

// Influence Score is defined over a fixed trailing window matching the
// activity-level tier window (28 days from data end), so the same member always
// reads the same score on the People table, the Top influencers card and the
// member popup regardless of the page's date-range picker.
export const INFLUENCE_DAYS = 28

export type InfluenceComponentKey = 'reach' | 'quality' | 'activity'

// Single source of truth for the Influence Score decomposition. `weight` is the
// factor applied to each 0-100 component in the score. Note that reach and
// activity are normalised against the community max, so they are relative
// measures; quality is an absolute average of the edge weights.
export const INFLUENCE_COMPONENTS: { key: InfluenceComponentKey; label: string; weight: number }[] = [
  { key: 'reach', label: 'Reach', weight: 0.4 },
  { key: 'quality', label: 'Relationship quality', weight: 0.4 },
  { key: 'activity', label: 'Activity', weight: 0.2 },
]

// Weighted contributions sum to the score, and their maxima sum to 100, so the
// member popup can render the make-up as a single stacked bar.
export const influenceOf = (parts: Record<InfluenceComponentKey, number>) =>
  INFLUENCE_COMPONENTS.reduce((sum, c) => sum + c.weight * parts[c.key], 0)

let influenceEngineData: RelationshipsData | null = null
export function influenceEngine(): RelationshipsData {
  if (!influenceEngineData) {
    const end = endDate.getTime()
    influenceEngineData = relationships(end - INFLUENCE_DAYS * DAY, end)
  }
  return influenceEngineData
}

export interface StrengthSnapshot {
  strength: number
  strengthDelta: number
  connectedness: number
  participation: number
  distribution: number
  relationshipQuality: number
}

const strengthCache = new Map<number, StrengthSnapshot>()

// Community Strength over the fixed basis window ending at `end`, plus its change
// against the equally long window before it. Deliberately not routed through
// relationships(), which builds the full edge/cluster/influence graph for a
// whole window just to read six numbers off the top of it.
export function strengthSnapshot(end: number): StrengthSnapshot {
  const hit = strengthCache.get(end)
  if (hit) return hit
  const len = STRENGTH_BASIS_DAYS * DAY
  const core = buildCore(end - len, end)
  const prev = buildCore(end - 2 * len, end - len)
  const snap: StrengthSnapshot = {
    strength: core.strength,
    strengthDelta: core.strength - prev.strength,
    connectedness: core.connectedness,
    participation: core.participation,
    distribution: core.distribution,
    relationshipQuality: core.relationshipQuality
  }
  strengthCache.set(end, snap)
  return snap
}

export function relationships(start: number, end: number): RelationshipsData {
  const { humans, memberName, memberUsername, memberJoined } = ensureBase()
  const key = `${start}|${end}`
  const hit = cache.get(key)
  if (hit) return hit

  const core = buildCore(start, end)

  const prev = buildCore(start - (end - start), start)
  const strengthDelta = core.strength - prev.strength
  const linksDelta = core.totalLinks - prev.totalLinks
  const connectedDelta = core.connectedCount - prev.connectedCount

  // per-member influence
  const candidateIds = new Set<string>()
  for (const e of core.edges) { candidateIds.add(e.a); candidateIds.add(e.b) }
  for (const id of core.inbound.keys()) candidateIds.add(id)
  for (const id of core.activity.keys()) candidateIds.add(id)

  const memberEdges = new Map<string, RelationshipEdge[]>()
  for (const e of core.edges) {
    let ea = memberEdges.get(e.a); if (!ea) { ea = []; memberEdges.set(e.a, ea) }
    let eb = memberEdges.get(e.b); if (!eb) { eb = []; memberEdges.set(e.b, eb) }
    ea.push(e); eb.push(e)
  }

  const reachCount = new Map<string, number>()
  for (const [id, set] of core.inbound) reachCount.set(id, set.size)
  const activityCount = core.activity

  const qualities = new Map<string, number>()
  for (const [id, es] of memberEdges) {
    const sum = es.reduce((a, e) => a + qualityWeight(e.label), 0)
    qualities.set(id, sum / es.length)
  }

  const inv = (values: string[], get: (id: string) => number) => {
    const max = values.reduce((a, id) => Math.max(a, get(id)), 0)
    return (id: string) => (max > 0 ? Math.min(100, (get(id) / max) * 100) : 0)
  }
  const idsArr = [...candidateIds]
  const reachNorm = inv(idsArr, (id) => reachCount.get(id) ?? 0)
  const activityNorm = inv(idsArr, (id) => activityCount.get(id) ?? 0)

  const degreeId = core.degree
  const memberInfo = new Map<string, MemberRelInfo>()
  const withDegree = [...degreeId.keys()].sort((x, y) => (degreeId.get(y) ?? 0) - (degreeId.get(x) ?? 0) || (x < y ? -1 : 1))
  const mostConnected = Math.max(1, Math.ceil(withDegree.length * 0.1))
  const mostConnectedIds = withDegree.slice(0, mostConnected)
  const mostSet = new Set(mostConnectedIds)

  for (const id of candidateIds) {
    const edges = memberEdges.get(id) ?? []
    const strong = edges.filter((e) => e.label === 'strong').length
    const mid = edges.filter((e) => e.label === 'mid').length
    const weak = edges.length - strong - mid
    const reach = reachNorm(id)
    const quality = qualities.get(id) ?? 0
    const activity = activityNorm(id)
    memberInfo.set(id, {
      memberId: id,
      name: memberName.get(id) ?? id,
      username: memberUsername.get(id) ?? null,
      degree: degreeId.get(id) ?? 0,
      mix: { strong, mid, weak },
      lastActive: core.lastSeen.get(id) ?? Number.NaN,
      joinedAt: memberJoined.get(id) ?? Number.NaN,
      reach,
      reachCount: reachCount.get(id) ?? 0,
      quality,
      activity,
      influence: influenceOf({ reach, quality, activity }),
      bridge: core.bridges.has(id),
      clusterId: core.memberCluster.get(id) ?? -1,
      mostConnected: mostSet.has(id),
    })
  }

  const influencers: InfluencerRow[] = [...memberInfo.values()]
    .filter((mi) => mi.degree > 0)
    .sort((a, b) => b.influence - a.influence || (a.memberId < b.memberId ? -1 : 1))
    .slice(0, 10)
    .map((mi) => ({
      memberId: mi.memberId,
      name: mi.name,
      connections: mi.degree,
      mix: mi.mix,
      reach: mi.reachCount,
      influence: mi.influence,
      lastActive: mi.lastActive,
      joinedAt: mi.joinedAt,
    }))

  const data: RelationshipsData = {
    start,
    end,
    totalMembers: humans.length,
    connectedCount: core.connectedCount,
    connectedPct: core.connectedPct,
    lessConnectedCount: core.lessConnectedCount,
    lessConnectedPct: core.lessConnectedPct,
    avgConnections: core.avgConnections,
    totalLinks: core.totalLinks,
    edges: core.edges,
    degree: core.degree,
    strength: core.strength,
    strengthDelta,
    connectedness: core.connectedness,
    participation: core.participation,
    distribution: core.distribution,
    relationshipQuality: core.relationshipQuality,
    buckets: core.buckets,
    clusters: core.clusters,
    bridgeCount: core.bridges.size,
    backbone: [],
    influencers,
    memberInfo,
    mostConnectedIds,
    labelCounts: core.labelCounts,
    linksDelta,
    connectedDelta,
    avgConnectionsDelta: core.avgConnections - prev.avgConnections,
  }
  data.backbone = selectBackbone(data, { cluster: null, minDegree: null })
  cache.set(key, data)
  return data
}