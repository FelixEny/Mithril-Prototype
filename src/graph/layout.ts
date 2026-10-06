import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import noverlap from 'graphology-layout-noverlap'
import type { LayoutResult, MemberSpec, Pt } from './types'

// Community layout via the Graphology stack — this module produces positions,
// the renderer (renderer.ts) renders them, and the population builder
// (build.ts) owns the data. There is no custom force solver here and no
// continuous simulation: the pipeline runs once per population.
//
// Pipeline: deterministic cluster-anchored seeding (communities chained by
// cross-cluster connectivity, ring radius scaled to graph density) -> ForceAtlas2
// (edge topology reshapes the seeded structure) -> Noverlap (avatar separation)
// -> normalize into the stable world rect. Sigma renders the result.
//
// Determinism: no Math.random anywhere. Seeding is a pure function of member
// order and cluster id, and both library passes are deterministic given
// identical inputs, so the same population yields byte-identical positions
// (gated by scripts/check-layout.mjs).

const W = 1000
const H = 475
const PAD = 26

const FA2_ITERATIONS = 400
const NOVERLAP_ITERATIONS = 300
const GOLDEN_ANGLE = 2.399963

// Seed-ring calibration: ringK = RING_A + RING_B * ln(meanDegree).
//
// The ring is imposed because ForceAtlas2 cannot derive inter-community spacing
// from the data itself: cross-cluster edges are only ~0.7% of all edges at 30d
// (36 of 5397), so every pure-force seeding collapses all five communities into
// one blob (5-NN purity 10-19% vs 77% here). The ring's ORDER decides which
// communities sit side by side, and ordering by cluster size is arbitrary, so
// clusters are chained by their real cross-cluster connectivity instead. That
// keeps linked communities adjacent and lets weakly linked ones drift outward,
// which is what makes each gap read as signal rather than as wasted space.
//
// RING_A/RING_B set the ring's radius and are scaled by ln(meanDegree) because
// one fixed radius cannot serve both ends of the density range: a ring wide
// enough for 7d collides on the denser 84d graph, one tight enough for 84d
// leaves 7d visibly gappy. Fitted against all four shipped ranges (mean degree
// 6.13 / 8.48 / 11.89 / 19.66 for 7/14/28/84d), these hold the gate shares the
// script re-checks -- stacked 0.8 / 0.9 / 4.2 / 15.8%, deep-blob 0 / 0 / 0 / 1.0% --
// while cutting the mid-range cross-vs-intra edge length ratio
// from 4.11 to 2.60 -- that ratio was the artifact, since it stretched the 36
// real cross-community links to four times the length of intra-community ones.
//
// The radius is a deliberate trade-off against that purity, so recalibrate
// deliberately rather than greedily: minimising the radius until the
// stacked <=35% / deep-blob <=8% gates in check-layout.mjs just clear lands on
// A=1 B=1, which equalises the mean gap near 50 world units but drops purity to
// 65-76% and blends the communities into one mass. Raise these constants if
// distinctness matters more than whitespace, and re-run
// `node scripts/check-layout.mjs 7 14 28 84` after regenerating the corpus.
const RING_A = 1.3
const RING_B = 1.2
// Degenerate populations (e.g. the synthetic bench graph) can have no edges at
// all; clamping keeps ln() finite so the seed ring never collapses to NaN.
const MIN_MEAN_DEGREE = 1

// Avatar world radii. Mirrors renderer.ts RADII/sizeForDegree (mirrored rather
// than imported so layout never imports the renderer); keep the two in sync.
const radiusForDegree = (deg: number): number => {
  if (deg >= 151) return 20
  if (deg >= 76) return 18
  if (deg >= 31) return 15
  if (deg >= 11) return 12
  return 9
}

export function runLayout(
  members: MemberSpec[],
  edges: { a: string; b: string; score?: number }[],
  iterations = FA2_ITERATIONS,
): LayoutResult {
  const positions = new Map<string, Pt>()
  const centroids = new Map<number, Pt>()
  if (members.length === 0) return { positions, centroids }

  const byId = new Map(members.map((m) => [m.id, m]))

  // 1. Cluster anchors. The seed ring only seeds the simulation — nothing
  // constrains nodes to a radius afterwards — but its order decides how far
  // apart communities end up, so clusters are chained by their real
  // cross-cluster connectivity rather than by size (see RING_A/RING_B).
  const byCluster = new Map<number, string[]>()
  for (const m of members) {
    const arr = byCluster.get(m.clusterId)
    if (arr) arr.push(m.id)
    else byCluster.set(m.clusterId, [m.id])
  }
  const clusterSize = (c: number): number => byCluster.get(c)?.length ?? 0

  // Cross-cluster weight per community pair, reusing the same log-compressed
  // score the member edges below use (raw 0-100 scores would let a few strong
  // ties dominate). Also tracked per cluster to pick the chain's starting point.
  const pairKey = (a: number, b: number): string => (a < b ? `${a}|${b}` : `${b}|${a}`)
  const crossWeight = new Map<string, number>()
  const crossTotal = new Map<number, number>()
  for (const e of edges) {
    const ca = byId.get(e.a)?.clusterId
    const cb = byId.get(e.b)?.clusterId
    if (ca === undefined || cb === undefined || ca === cb) continue
    const w = 1 + Math.log1p(Math.max(0, e.score ?? 0))
    crossWeight.set(pairKey(ca, cb), (crossWeight.get(pairKey(ca, cb)) ?? 0) + w)
    crossTotal.set(ca, (crossTotal.get(ca) ?? 0) + w)
    crossTotal.set(cb, (crossTotal.get(cb) ?? 0) + w)
  }
  const linkTo = (a: number, b: number): number => crossWeight.get(pairKey(a, b)) ?? 0

  // Unclustered members (-1) stay pinned at the centre instead of taking a ring
  // slot: they belong to no community, so no ring position would be honest.
  const unvisited = new Set([...byCluster.keys()].filter((c) => c !== -1))
  const order: number[] = []
  if (unvisited.size > 0) {
    // Greedy nearest-neighbour chain. Every comparison falls back to cluster
    // size then cluster id, so equal weights never reorder between runs.
    const sizeDesc = (a: number, b: number): number => clusterSize(b) - clusterSize(a)
    const idAsc = (a: number, b: number): number => a - b
    const [first] = [...unvisited].sort(
      (a, b) =>
        (crossTotal.get(b) ?? 0) - (crossTotal.get(a) ?? 0) || sizeDesc(a, b) || idAsc(a, b),
    )
    order.push(first)
    unvisited.delete(first)
    while (unvisited.size > 0) {
      const current = order[order.length - 1]
      const [next] = [...unvisited].sort(
        (a, b) => linkTo(current, b) - linkTo(current, a) || sizeDesc(a, b) || idAsc(a, b),
      )
      order.push(next)
      unvisited.delete(next)
    }
  }
  const rank = new Map(order.map((c, i) => [c, i]))

  // Anchor ellipse sized against FA2's measured equilibrium span, so the uniform
  // normalize below stays near-identity and the graph lands on the world width
  // with no letterbox. ringK is the knob that sets inter-community whitespace;
  // see the calibration block above before changing it.
  const meanDegree = (2 * edges.length) / members.length
  const ringK = RING_A + RING_B * Math.log(Math.max(MIN_MEAN_DEGREE, meanDegree))
  const cx = W / 2
  const cy = H / 2
  const ringR = Math.min(W, H) * 0.32
  const anchorOf = (c: number): Pt => {
    if (c === -1) return { x: cx, y: cy }
    const a = ((rank.get(c) ?? 0) / Math.max(1, order.length)) * Math.PI * 2 - Math.PI / 2
    return { x: cx + Math.cos(a) * ringR * ringK, y: cy + Math.sin(a) * ringR }
  }

  // 2. Seed: golden-angle spiral per cluster (area-uniform, no RNG) on a
  // graphology graph carrying avatar size (for adjustSizes/noverlap) and a
  // log-compressed edge weight (scores are 0-100ish; raw scores would let a
  // few strong ties dominate the attraction).
  const graph = new Graph({ type: 'undirected' })
  for (const [c, ids] of byCluster) {
    const anchor = anchorOf(c)
    const spread = Math.max(60, Math.sqrt(ids.length) * 22)
    const phase = (rank.get(c) ?? 0) * 0.9
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const a = i * GOLDEN_ANGLE + phase
      const r = spread * Math.sqrt((i + 0.5) / ids.length)
      graph.addNode(id, {
        x: anchor.x + Math.cos(a) * r,
        y: anchor.y + Math.sin(a) * r * 0.85,
        size: radiusForDegree(byId.get(id)?.degree ?? 0),
        clusterId: c,
      })
    }
  }
  for (const e of edges) {
    if (e.a === e.b) continue
    if (!graph.hasNode(e.a) || !graph.hasNode(e.b)) continue
    graph.mergeEdge(e.a, e.b, { weight: 1 + Math.log1p(Math.max(0, e.score ?? 0)) })
  }

  // 3. ForceAtlas2: the library owns the force simulation; its output is the
  // layout. inferSettings gives a size-sensible base, we only switch on the
  // Barnes-Hut approximation and size-aware repulsion.
  forceAtlas2.assign(graph, {
    iterations,
    getEdgeWeight: 'weight',
    settings: {
      ...forceAtlas2.inferSettings(graph),
      barnesHutOptimize: true,
      barnesHutTheta: 0.8,
      adjustSizes: true,
      edgeWeightInfluence: 1,
      // Spread the equilibrium relative to avatar sizes (inferSettings'
      // strong-gravity default packs ~1k nodes too tightly for radius 9-20
      // discs): stronger repulsion, gentler central pull.
      scalingRatio: 30,
      strongGravityMode: false,
      gravity: 1,
    },
  })

  // 4. Noverlap: resolve avatars FA2 left touching (margin in world units).
  // A single fast pass at margin 4 converges better than slower/longer or
  // looser settings — pairs that the (fixed) world density forbids from
  // reaching margin-4 spacing settle at a fixed point rather than being
  // repeatedly re-agitated. Skipped when NOVERLAP_ITERATIONS is 0 (ablation /
  // degenerate inputs).
  if (NOVERLAP_ITERATIONS > 0) {
    noverlap.assign(graph, {
      maxIterations: NOVERLAP_ITERATIONS,
      settings: { margin: 4, ratio: 1, expansion: 1.1, speed: 3, gridSize: 20 },
    })
  }

  // 5. Normalize into the stable world rect (FA2's output scale is arbitrary;
  // the renderer clamps dragging to these dimensions and fits the camera to
  // the node bbox, so positions must live here, not just relatively).
  // Uniform scale (letterboxed, not stretched): a per-axis stretch would undo
  // Noverlap's contact geometry by compressing one axis.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  graph.forEachNode((_, attr) => {
    const x = attr.x as number
    const y = attr.y as number
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  })
  const spanX = maxX - minX
  const spanY = maxY - minY
  const sx = spanX > 1e-9 ? (W - 2 * PAD) / spanX : Infinity
  const sy = spanY > 1e-9 ? (H - 2 * PAD) / spanY : Infinity
  const s = Math.min(sx, sy)
  const scale = Number.isFinite(s) ? s : 1
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const sums = new Map<number, { x: number; y: number; n: number }>()
  graph.forEachNode((id, attr) => {
    const x = W / 2 + ((attr.x as number) - midX) * scale
    const y = H / 2 + ((attr.y as number) - midY) * scale
    positions.set(id, { x, y })
    const c = attr.clusterId as number
    let s = sums.get(c)
    if (!s) {
      s = { x: 0, y: 0, n: 0 }
      sums.set(c, s)
    }
    s.x += x
    s.y += y
    s.n++
  })
  for (const [c, s] of sums) centroids.set(c, { x: s.x / s.n, y: s.y / s.n })
  return { positions, centroids }
}
