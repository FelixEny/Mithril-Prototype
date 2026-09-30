// Layout gates for the Graphology pipeline (src/graph/layout.ts).
//
// Loads the real app modules through vite's SSR runner (no new tooling;
// handles TS + `?url` imports) with a fetch shim reading the mock JSON corpus
// from disk, then checks the REAL 30d/90d populations:
//   1. determinism: two runLayout runs -> byte-identical positions (required)
//   2. validity: every member positioned, finite, inside the world rect (required)
//   3. rebuild freshness: filtered populations position exactly their members (required)
//   4. separation: touching-neighbor histogram + blob-core share (gated, see below)
//   5. structure: connected pairs closer on average than random pairs (required)
//   6. timing: wall ms reported (fails over budget)
//
// Run: node scripts/check-layout.mjs [days...] (default: 30 90; dev server NOT required)

import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const DAY = 86400000
const argDays = process.argv.slice(2).map(Number).filter((d) => d === 30 || d === 90)
const RANGES = argDays.length ? argDays : [30, 90]

// loadData() fetches `?url` asset URLs; serve the mock corpus from disk.
globalThis.fetch = async (url) => {
  const name = basename(String(url).split('?')[0])
  try {
    const text = readFileSync(join(root, 'src', 'data', name), 'utf8')
    return { ok: true, json: async () => JSON.parse(text) }
  } catch {
    return { ok: false, status: 404, json: async () => null }
  }
}

const { createServer } = await import('vite')
const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' })
let dataMod, relMod, buildMod, layoutMod
try {
  dataMod = await server.ssrLoadModule('/src/data/index.ts')
  relMod = await server.ssrLoadModule('/src/relationships.ts')
  buildMod = await server.ssrLoadModule('/src/graph/build.ts')
  layoutMod = await server.ssrLoadModule('/src/graph/layout.ts')
} finally {
  await server.close()
}
await dataMod.loadData()
const { runLayout } = layoutMod
const { buildPopulation } = buildMod
const { relationships } = relMod
const end = dataMod.endDate.getTime()

// Avatar radii mirror (keep in sync with layout.ts / renderer.ts).
const radiusForDegree = (deg) => {
  if (deg >= 151) return 20
  if (deg >= 76) return 18
  if (deg >= 31) return 15
  if (deg >= 11) return 12
  return 9
}

const W = 1000
const H = 475
const PAD = 26

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failures++
}

const layoutMetrics = (members, edges, positions) => {
  const ids = members.map((m) => m.id)
  const index = new Map(ids.map((id, i) => [id, i]))
  const xs = new Float64Array(ids.length)
  const ys = new Float64Array(ids.length)
  const rs = new Float64Array(ids.length)
  ids.forEach((id, i) => {
    const p = positions.get(id)
    xs[i] = p.x
    ys[i] = p.y
    rs[i] = radiusForDegree(members[i].degree)
  })
  // Touching-neighbor histogram (O(n^2); ~1k nodes is fine). "Touching"
  // (dist < ri+rj) includes merely adjacent discs, which dense packing makes
  // unavoidable; "stacked" (dist < (ri+rj)/2) is the real pile-up signal.
  const hist = [0, 0, 0, 0]
  let stackedNodes = 0
  let deepBlob = 0
  let nearestSum = 0
  for (let i = 0; i < ids.length; i++) {
    let touching = 0
    let stacked = 0
    let best = Infinity
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue
      const d = Math.hypot(xs[i] - xs[j], ys[i] - ys[j])
      if (d < best) best = d
      if (d < rs[i] + rs[j]) touching++
      if (d < (rs[i] + rs[j]) / 2) stacked++
    }
    nearestSum += best
    hist[touching === 0 ? 0 : touching <= 2 ? 1 : touching <= 5 ? 2 : 3]++
    if (stacked > 0) stackedNodes++
    if (stacked >= 3) deepBlob++
  }
  // Connected vs random pair distances.
  let edgeSum = 0
  let edgeN = 0
  for (const e of edges) {
    const a = index.get(e.a)
    const b = index.get(e.b)
    if (a === undefined || b === undefined) continue
    edgeSum += Math.hypot(xs[a] - xs[b], ys[a] - ys[b])
    edgeN++
  }
  let s = 1337
  const rand = () => {
    s = (Math.imul(s ^ (s >>> 15), 1 | s) + 0x6d2b79f5) | 0
    return ((s ^ (s >>> 14)) >>> 0) / 4294967296
  }
  let randSum = 0
  const K = Math.min(edgeN, 4000)
  for (let k = 0; k < K; k++) {
    const a = Math.floor(rand() * ids.length)
    let b = Math.floor(rand() * ids.length)
    if (a === b) b = (b + 1) % ids.length
    randSum += Math.hypot(xs[a] - xs[b], ys[a] - ys[b])
  }
  return {
    hist,
    stackedFrac: stackedNodes / ids.length,
    deepBlobFrac: deepBlob / ids.length,
    meanNN: nearestSum / ids.length,
    edgeMean: edgeSum / edgeN,
    randMean: randSum / K,
  }
}

const ser = (m) => JSON.stringify([...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)))

for (const days of RANGES) {
  console.log(`\n--- ${days}d window ---`)
  const data = relationships(end - days * DAY, end)
  const pop = buildPopulation(data, { cluster: null, minDegree: null })
  const { members, edges } = pop
  console.log(`population: ${members.length} members, ${edges.length} edges`)

  // 1. Determinism (direct runLayout calls bypass build.ts's layoutCache).
  const t0 = performance.now()
  const first = runLayout(members, edges)
  const t1 = performance.now()
  const second = runLayout(members, edges)
  const t2 = performance.now()
  check(`[${days}d] deterministic across runs (byte-identical)`, ser(first.positions) === ser(second.positions))
  console.log(`[${days}d] layout wall time: ${(t1 - t0).toFixed(0)}ms / ${(t2 - t1).toFixed(0)}ms`)
  check(`[${days}d] layout under 10s budget`, t1 - t0 < 10000, `${(t1 - t0).toFixed(0)}ms`)

  // 2. Validity.
  const pos = first.positions
  let bad = 0
  let oob = 0
  let bx0 = Infinity
  let bx1 = -Infinity
  let by0 = Infinity
  let by1 = -Infinity
  for (const m of members) {
    const p = pos.get(m.id)
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { bad++; continue }
    if (p.x < bx0) bx0 = p.x
    if (p.x > bx1) bx1 = p.x
    if (p.y < by0) by0 = p.y
    if (p.y > by1) by1 = p.y
    if (p.x < PAD - 1e-6 || p.x > W - PAD + 1e-6 || p.y < PAD - 1e-6 || p.y > H - PAD + 1e-6) oob++
  }
  check(`[${days}d] every member positioned + finite`, bad === 0, `${pos.size}/${members.length}`)
  console.log(`[${days}d] world bbox used: x[${bx0.toFixed(0)},${bx1.toFixed(0)}] y[${by0.toFixed(0)},${by1.toFixed(0)}]`)
  check(`[${days}d] inside world rect`, oob === 0, oob ? `${oob} outside` : `x[${PAD},${W - PAD}] y[${PAD},${H - PAD}]`)

  // 3. Rebuild freshness (filtered populations position exactly their members).
  for (const filter of [{ cluster: 0, minDegree: null }, { cluster: null, minDegree: 10 }]) {
    const fpop = buildPopulation(data, filter)
    const want = new Set(fpop.members.map((m) => m.id))
    const got = new Set(fpop.positioned.keys())
    const stale = [...got].filter((k) => !want.has(k)).length
    const missing = [...want].filter((k) => !got.has(k)).length
    check(`[${days}d] rebuild fresh ${JSON.stringify(filter)}`, stale === 0 && missing === 0, `${fpop.members.length} members`)
  }

  // 4+5. Separation + structure.
  //
  // Gate thresholds are density-derived, not aspirational. The world rect
  // (1000x475, PAD 26 -> 948x423 usable) can seat at MOST ~687 equal r=9
  // avatars at Noverlap's margin-4 spacing (hexagonal cell (sqrt(3)/2)*26^2
  // =~ 585 u^2 each). Both real windows exceed that (873 / 1137 members), so a
  // fraction must overlap no matter what; these gates trip on a regression to
  // a collapsed layout (the old custom solver sat at ~71-84% stacked), not on
  // the unavoidable floor.
  const m = layoutMetrics(members, edges, pos)
  console.log(
    `[${days}d] touching-neighbor histogram (0 / 1-2 / 3-5 / 6+): ${m.hist.join(' / ')}; ` +
    `meanNN ${m.meanNN.toFixed(1)}; stacked ${(m.stackedFrac * 100).toFixed(1)}%; deep-blob ${(m.deepBlobFrac * 100).toFixed(1)}%`,
  )
  check(`[${days}d] no pile-ups beyond density floor (<=35% stacked)`, m.stackedFrac <= 0.35, `${(m.stackedFrac * 100).toFixed(1)}%`)
  check(`[${days}d] no blob cores (<=8% with 3+ stacked)`, m.deepBlobFrac <= 0.08, `${(m.deepBlobFrac * 100).toFixed(1)}%`)
  console.log(`[${days}d] mean connected-pair ${m.edgeMean.toFixed(1)} vs random-pair ${m.randMean.toFixed(1)}`)
  check(`[${days}d] connected members form neighborhoods`, m.edgeMean < m.randMean)
}

if (failures > 0) {
  console.error(`\ncheck-layout failed: ${failures} check(s)`)
  process.exit(1)
}
console.log('\ncheck-layout passed.')
