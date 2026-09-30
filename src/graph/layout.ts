import Graph from 'graphology'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import noverlap from 'graphology-layout-noverlap'
import type { LayoutResult, MemberSpec, Pt } from './types'

// Community layout via the Graphology stack — this module produces positions,
// the renderer (renderer.ts) renders them, and the population builder
// (build.ts) owns the data. There is no custom force solver here and no
// continuous simulation: the pipeline runs once per population.
//
// Pipeline: deterministic cluster-anchored seeding -> ForceAtlas2 (edge
// topology reshapes the seeded structure) -> Noverlap (avatar separation)
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

  // 1. Cluster anchors: deterministic, larger clusters first. These only seed
  // the simulation — nothing constrains nodes to a radius afterwards.
  const byCluster = new Map<number, string[]>()
  for (const m of members) {
    const arr = byCluster.get(m.clusterId)
    if (arr) arr.push(m.id)
    else byCluster.set(m.clusterId, [m.id])
  }
  const clusters = [...byCluster.keys()].sort(
    (a, b) => (byCluster.get(b)?.length ?? 0) - (byCluster.get(a)?.length ?? 0),
  )
  const ordinal = new Map(clusters.map((c, i) => [c, i]))
  const cx = W / 2
  const cy = H / 2
  const ringR = Math.min(W, H) * 0.32
  const ringK = 5.1
  const anchorOf = (c: number): Pt => {
    if (c === -1) return { x: cx, y: cy }
    // Wide anchor ellipse sized so ForceAtlas2's equilibrium fills the world
    // rect (the uniform normalize then stays near-identity). Repulsion expands
    // the seed; ringK is calibrated against the measured FA2 span so the
    // output lands at the world width with no letterbox.
    const a = (ordinal.get(c)! / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2
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
    const phase = (ordinal.get(c) ?? 0) * 0.9
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
