import type { MemberRelInfo, RelationshipsData, StrengthLabel } from '../../relationships'

// Synthetic populations for the performance bench (#/bench).
//
// These mirror the shape of the real 30-day corpus (degree distribution,
// ~5 surfaced clusters, label mix strong/mid/weak 33/64/4%, average degree ~8)
// at scales the mock corpus can't reach (2k..50k members). The remainder of
// the RelationshipsData envelope is filled with conservative placeholders only
// the graph pipeline touches: buildPopulation reads `degree`, `memberInfo`
// (name/influence/clusterId/bridge/mostConnected) and `edges` (a/b/score/label).

export const BENCH_SIZES = [2000, 5000, 10000, 20000, 50000] as const
export type BenchSize = (typeof BENCH_SIZES)[number]

export const EDGES_PER_NODE = 3.55

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// Heavy-tailed degree distribution with average ~8 (matches the 30-day window).
function sampleDegree(rand: () => number): number {
  const r = rand()
  if (r < 0.45) return 1 + Math.floor(rand() * 2) // 1..2
  if (r < 0.7) return 3 + Math.floor(rand() * 4) // 3..6
  if (r < 0.85) return 7 + Math.floor(rand() * 8) // 7..14
  if (r < 0.95) return 15 + Math.floor(rand() * 16) // 15..30
  if (r < 0.99) return 31 + Math.floor(rand() * 30) // 31..60
  return 61 + Math.floor(rand() * 80) // 61..140
}

export function syntheticRelationships(n: number, seed = 1337): RelationshipsData {
  const rand = mulberry32(seed)
  const degree = new Map<string, number>()
  const memberInfo = new Map<string, MemberRelInfo>()
  const ids: string[] = []

  // Degrees first (need the full distribution before assigning hubs/most-connected).
  const degrees: number[] = []
  for (let i = 0; i < n; i++) {
    const id = `m_${i + 1}`
    degrees.push(sampleDegree(rand))
    ids.push(id)
  }
  const degRank = ids.slice().sort((a, b) => degrees[+a.slice(2) - 1] - degrees[+b.slice(2) - 1])
  const mostCount = Math.max(1, Math.ceil(n * 0.1))
  const mostConnected = new Set(degRank.slice(-mostCount))

  // ~5 surfaced clusters sized like the real corpus (≈19% each), rest unclustered.
  const clusters = 5
  const clusterSize = Math.floor(n / clusters)
  const bridges = new Set<string>()
  for (let i = 0; i < n; i++) {
    const id = `m_${i + 1}`
    const d = degrees[i]
    degree.set(id, d)
    const clusterId = i < clusters * clusterSize ? Math.floor(i / clusterSize) : -1
    const influence = Math.min(100, (d / 120) * 60 + rand() * 28)
    const base = `member${id.slice(2)}`
    memberInfo.set(id, {
      memberId: id,
      name: `Member ${id.slice(2)}`,
      username: `${base}.${clusterId >= 0 ? 'm' : 'x'}${id.slice(-3)}`,
      degree: d,
      mix: { strong: Math.floor(d * 0.33), mid: Math.floor(d * 0.64), weak: d - Math.floor(d * 0.97) },
      lastActive: 0,
      joinedAt: 0,
      reach: influence * 0.6,
      reachCount: d,
      quality: 62 + rand() * 24,
      activity: influence,
      influence,
      bridge: i % (n / 10) === 3 && clusterId !== -1,
      clusterId,
      mostConnected: mostConnected.has(id),
    })
    if (memberInfo.get(id)!.bridge) bridges.add(id)
  }

  // Configuration-model edge generation (seeded): pair degree stubs, avoid
  // self-loops and duplicate edges, then label by score tier.
  const edgeCount = Math.round(n * EDGES_PER_NODE)
  const edgeSet = new Set<string>()
  const edges: RelationshipsData['edges'] = []
  const stubs: number[] = []
  for (let i = 0; i < n; i++) for (let k = 0; k < degrees[i]; k++) stubs.push(i)
  // Fisher-Yates over the stub array is O(n) and deterministic.
  for (let i = stubs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = stubs[i]
    stubs[i] = stubs[j]
    stubs[j] = t
  }
  let guard = 0
  while (edges.length < edgeCount && guard < edgeCount * 3) {
    guard++
    if (stubs.length < 2) break
    const a = stubs.pop()!
    const b = stubs.pop()!
    if (a === b) continue
    const key = a < b ? `${a}|${b}` : `${b}|${a}`
    if (edgeSet.has(key)) continue
    edgeSet.add(key)
    edges.push({ a: `m_${a + 1}`, b: `m_${b + 1}`, count: 2, days: 2, weeks: 2, firstAt: 0, lastAt: 0, score: 0, label: 'mid' })
  }

  // Rank by score desc like buildPopulation does, label with the real mix.
  const strong = Math.floor(edges.length * 0.33)
  const mid = Math.floor(edges.length * 0.97)
  edges.sort((x, y) => y.score - x.score) // stable no-op, keeps generation order
  for (let i = 0; i < edges.length; i++) {
    edges[i].score = edges.length - i
    const label: StrengthLabel = i < strong ? 'strong' : i < mid ? 'mid' : 'weak'
    edges[i].label = label
  }

  return {
    start: 0,
    end: 0,
    totalMembers: n,
    connectedCount: 0,
    connectedPct: 0,
    lessConnectedCount: 0,
    lessConnectedPct: 0,
    avgConnections: 0,
    totalLinks: edges.length,
    edges,
    degree,
    strength: 0,
    strengthDelta: 0,
    connectedness: 0,
    participation: 0,
    distribution: 0,
    relationshipQuality: 0,
    buckets: [],
    clusters: Array.from({ length: clusters }, (_, i) => ({ id: i, size: clusterSize, memberIds: ids.slice(i * clusterSize, (i + 1) * clusterSize) })),
    bridgeCount: bridges.size,
    backbone: [],
    influencers: [],
    memberInfo,
    mostConnectedIds: [...mostConnected],
    labelCounts: { strong, mid: mid - strong, weak: edges.length - mid },
    linksDelta: 0,
    connectedDelta: 0,
    avgConnectionsDelta: 0,
  }
}