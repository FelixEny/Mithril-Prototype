import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Relationship-story verification for the mock data corpus. Ports the edge
// scoring, the four composite strength components and the clustering logic from
// src/relationships.ts (keep STRONG_AT / MID_AT / FREQ_K / PARTICIPATION_PORTION
// in sync) and prints the metrics the Relationships page derives from a window.
// Run: node scripts/verify-relationships.mjs [days...]
//
// `strength` here is the Community Strength composite. It is only meaningful on
// the calibrated basis window -- on a short window the >=2-interaction edge
// threshold starves the components and the score collapses for reasons that have
// nothing to do with the community. See STRENGTH_BASIS_DAYS in src/relationships.ts.

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDir = join(root, 'src', 'data')
const read = (name) => JSON.parse(readFileSync(join(dataDir, `${name}.json`), 'utf8'))

const STRONG_AT = 70
const MID_AT = 40
const FREQ_K = 4
const PARTICIPATION_PORTION = 0.25
const W_CONN = 0.35
const W_PART = 0.3
const W_DIST = 0.2
const W_QUAL = 0.15
const qualityWeight = (label) => (label === 'strong' ? 100 : label === 'mid' ? 60 : 20)

const DAY = 86400000
const messages = read('messages')
const replies = read('replies')
const reactions = read('reactions')
const members = read('members')

const end = new Date(read('schema').dateRange.end).getTime()
const lOn = (t) => new Date(t).getTime()
const msgAuthor = new Map(messages.map((m) => [m.id, m.authorId]))
const humans = members.filter((m) => !m.bot)
const humanSet = new Set(humans.map((m) => m.id))
const weekOf = (t) => new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10)

function compute(start, winEnd) {
  const pairs = new Map()
  const touch = (a, b, t) => {
    if (a === b || !humanSet.has(a) || !humanSet.has(b)) return
    const k = a < b ? a + '|' + b : b + '|' + a
    let acc = pairs.get(k)
    if (!acc) { acc = { a, b, count: 0, days: new Set(), weeks: new Set(), firstAt: t, lastAt: t }; pairs.set(k, acc) }
    acc.count++
    acc.days.add(new Date(t).toDateString())
    acc.weeks.add(weekOf(t))
    if (t < acc.firstAt) acc.firstAt = t
    if (t > acc.lastAt) acc.lastAt = t
  }
  for (const r of replies) {
    const t = lOn(r.timestamp); if (t < start || t > winEnd) continue
    const a = msgAuthor.get(r.messageId); if (a !== undefined) touch(a, r.authorId, t)
  }
  for (const r of reactions) {
    const t = lOn(r.timestamp); if (t < start || t > winEnd) continue
    const a = msgAuthor.get(r.messageId); if (a !== undefined) touch(a, r.memberId, t)
  }

  const edges = []
  for (const acc of pairs.values()) {
    if (acc.count < 2 || acc.days.size < 2) continue
    const weeksIn = Math.max(1, Math.round((winEnd - start) / (7 * DAY)))
    const freq = 100 * (1 - Math.exp(-acc.count / FREQ_K))
    const recency = 100 * Math.min(1, (acc.lastAt - start) / (winEnd - start))
    const consistency = 100 * (0.65 * Math.min(1, acc.weeks.size / weeksIn) + 0.35 * Math.min(1, acc.days.size / 2.5))
    const score = 0.4 * freq + 0.3 * recency + 0.3 * consistency
    edges.push({ a: acc.a, b: acc.b, count: acc.count, days: acc.days.size, lastAt: acc.lastAt, label: score >= STRONG_AT ? 'strong' : score >= MID_AT ? 'mid' : 'weak' })
  }

  const degreeMap = new Map()
  for (const e of edges) { degreeMap.set(e.a, (degreeMap.get(e.a) || 0) + 1); degreeMap.set(e.b, (degreeMap.get(e.b) || 0) + 1) }
  const connectedCount = [...degreeMap.values()].filter((d) => d >= 2).length
  const labelCounts = { strong: 0, mid: 0, weak: 0 }
  for (const e of edges) labelCounts[e.label]++
  const total = edges.length

  // Louvain-lite (port of partitionClusters)
  const nodes = new Set()
  for (const e of edges) { nodes.add(e.a); nodes.add(e.b) }
  const ids = [...nodes].sort()
  const index = new Map(ids.map((id, i) => [id, i]))
  const adj = new Map()
  const deg = new Array(ids.length).fill(0)
  for (const e of edges) {
    const ia = index.get(e.a), ib = index.get(e.b)
    let ma = adj.get(ia); if (!ma) { ma = new Map(); adj.set(ia, ma) }
    let mb = adj.get(ib); if (!mb) { mb = new Map(); adj.set(ib, mb) }
    ma.set(ib, (ma.get(ib) || 0) + 1); mb.set(ia, (mb.get(ia) || 0) + 1)
    deg[ia]++; deg[ib]++
  }
  const m = edges.length
  const community = ids.map((_, i) => i)
  const commL = new Array(ids.length).fill(0)
  const commS = deg.slice()
  const edgesTo = (id, c) => { let k = 0; for (const [nb, w] of adj.get(id) || []) if (community[nb] === c) k += w; return k }
  const moveGain = (id, c, kC) => {
    const cur = community[id]; if (c === cur) return 0
    const kD = edgesTo(id, cur), kI = deg[id]
    return ((commL[c] + kC) / m - ((commS[c] + kI) / (2 * m)) ** 2 - commL[c] / m + (commS[c] / (2 * m)) ** 2) +
      ((commL[cur] - kD) / m - ((commS[cur] - kI) / (2 * m)) ** 2 - commL[cur] / m + (commS[cur] / (2 * m)) ** 2)
  }
  const order = ids.map((_, i) => i).sort((x, y) => deg[y] - deg[x] || x - y)
  for (let pass = 0; pass < 24; pass++) {
    let changed = false
    for (const id of order) {
      const cur = community[id]
      const cands = new Set([cur])
      for (const nb of adj.get(id)?.keys() || []) cands.add(community[nb])
      let best = cur, bestGain = 0
      for (const c of cands) {
        if (c === cur) continue
        const kC = edgesTo(id, c), g = moveGain(id, c, kC)
        if (g > bestGain || (g === bestGain && c < best)) { best = c; bestGain = g }
      }
      if (best !== cur) {
        const kC = edgesTo(id, best), kD = edgesTo(id, cur), kI = deg[id]
        commL[best] += kC; commS[best] += kI; commL[cur] -= kD; commS[cur] -= kI
        community[id] = best; changed = true
      }
    }
    if (!changed) break
  }
  const groups = new Map()
  for (let i = 0; i < ids.length; i++) {
    const arr = groups.get(community[i]); if (arr) arr.push(ids[i]); else groups.set(community[i], [ids[i]])
  }
  const clusters = [...groups.entries()].filter(([, g]) => g.length >= 10).map(([, g]) => g.length).sort((a, b) => b - a)

  const surfaced = new Map()
  let cid = 0
  for (const [, g] of groups) if (g.length >= 10) { for (const id of g) surfaced.set(id, cid); cid++ }
  const bridgeCandidates = new Map()
  for (const e of edges) {
    const ma = surfaced.get(e.a) ?? -1, mb = surfaced.get(e.b) ?? -1
    if (ma !== -1 && mb !== -1 && mb !== ma) {
      let s = bridgeCandidates.get(e.a); if (!s) { s = new Set(); bridgeCandidates.set(e.a, s) }
      s.add(mb)
    }
    if (mb !== -1 && ma !== -1 && ma !== mb) {
      let s = bridgeCandidates.get(e.b); if (!s) { s = new Set(); bridgeCandidates.set(e.b, s) }
      s.add(ma)
    }
  }
  let bridgeCount = 0
  for (const s of bridgeCandidates.values()) if (s.size >= 2) bridgeCount++

  const degAll = humans.map((m2) => degreeMap.get(m2.id) || 0).sort((a, b) => a - b)
  const n = degAll.length
  const sum = degAll.reduce((a, x) => a + x, 0)
  const gini = n && sum && degAll[n - 1] > 0 ? Math.max(0, Math.min(1, 2 * degAll.reduce((a, x, i) => a + (i + 1) * x, 0) / (n * sum) - (n + 1) / n)) : 0
  const sorted = [...degreeMap.values()].sort((a, b) => a - b)
  const pctOf = (x) => (total ? ((x / total) * 100).toFixed(0) : '0')

  // Community Strength composite (port of buildCore's tail).
  const connectedness = (connectedCount / humans.length) * 100
  const partStart = winEnd - (winEnd - start) * PARTICIPATION_PORTION
  const connectedSet = new Set([...degreeMap].filter(([, d]) => d >= 2).map(([id]) => id))
  const maintained = new Set()
  for (const e of edges) if (e.lastAt >= partStart) { maintained.add(e.a); maintained.add(e.b) }
  let maintainedConnected = 0
  for (const id of connectedSet) if (maintained.has(id)) maintainedConnected++
  const participation = connectedCount > 0 ? (maintainedConnected / connectedCount) * 100 : 0
  const distribution = Math.max(0, 100 * (1 - gini))
  const qSum = edges.reduce((s, e) => s + qualityWeight(e.label), 0)
  const relationshipQuality = total > 0 ? qSum / total : 0
  const strength = W_CONN * connectedness + W_PART * participation + W_DIST * distribution + W_QUAL * relationshipQuality

  const days = Math.round((winEnd - start) / DAY)
  console.log(`\n=== ${days}d window (${new Date(start).toISOString().slice(0, 10)} .. ${new Date(winEnd).toISOString().slice(0, 10)})`)
  console.log(`totalLinks=${total}  nodesWithDegree=${degreeMap.size}  connected(>=2)=${connectedCount}/${humans.length} (${((connectedCount / humans.length) * 100).toFixed(1)}%)`)
  console.log(`avgConn=${(total / humans.length).toFixed(2)}  avg per connected=${(total / Math.max(1, connectedCount)).toFixed(1)}`)
  console.log(`labels: strong=${labelCounts.strong} (${pctOf(labelCounts.strong)}%)  mid=${labelCounts.mid} (${pctOf(labelCounts.mid)}%)  weak=${labelCounts.weak} (${pctOf(labelCounts.weak)}%)`)
  console.log(`degree: max=${sorted[sorted.length - 1] || 0}  p90=${sorted[Math.floor(sorted.length * 0.9)] || 0}  p75=${sorted[Math.floor(sorted.length * 0.75)] || 0}  p50=${sorted[Math.floor(sorted.length * 0.5)] || 0}  zeroDeg=${degAll.filter((d) => d === 0).length}`)
  console.log(`clusters(>=10): [${clusters.join(', ')}] count=${clusters.length}  >=50: ${clusters.filter((c) => c >= 50).length}`)
  console.log(`bridges=${bridgeCount}  gini=${gini.toFixed(3)}`)
  console.log(`strength=${strength.toFixed(2)}/100  [conn ${connectedness.toFixed(1)} x${W_CONN} | part ${participation.toFixed(1)} x${W_PART} | dist ${distribution.toFixed(1)} x${W_DIST} | qual ${relationshipQuality.toFixed(1)} x${W_QUAL}]`)
}

const daysArg = process.argv.slice(2).map(Number).filter((x) => x > 0)
const windows = daysArg.length ? daysArg : [28, 84]
for (const d of windows) compute(end - d * DAY, end)