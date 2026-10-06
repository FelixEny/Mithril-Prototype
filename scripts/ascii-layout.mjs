// ASCII density dump of the layout output (for an image-blind agent).
// node ascii-layout.mjs [days]
import { readFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const DAY = 86400000
const days = Number(process.argv[2] || 28)

globalThis.fetch = async (url) => {
  const name = basename(String(url).split('?')[0])
  try {
    const text = readFileSync(join(root, 'src', 'data', name), 'utf8')
    return { ok: true, json: async () => JSON.parse(text) }
  } catch {
    return { ok: false, status: 404, json: async () => null }
  }
}

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
const { relationships } = relMod
const { buildPopulation } = buildMod
const { runLayout } = layoutMod
const end = dataMod.endDate.getTime()

const pop = buildPopulation(relationships(end - days * DAY, end), { cluster: null, minDegree: null })
const t0 = performance.now()
const { positions, centroids } = runLayout(pop.members, pop.edges)
console.log(`days=${days} members=${pop.members.length} edges=${pop.edges.length} layout=${(performance.now() - t0).toFixed(0)}ms`)

const W = 96, H = 40
const grid = new Uint16Array(W * H)
let xs = [], ys = []
for (const m of pop.members) {
  const p = positions.get(m.id)
  xs.push(p.x); ys.push(p.y)
  const cx = Math.max(0, Math.min(W - 1, Math.floor((p.x / 1000) * W)))
  const cy = Math.max(0, Math.min(H - 1, Math.floor((p.y / 475) * H)))
  grid[cy * W + cx]++
}
const ramp = ' .:oO@#%'
console.log(`x range [${Math.min(...xs).toFixed(0)},${Math.max(...xs).toFixed(0)}] y [${Math.min(...ys).toFixed(0)},${Math.max(...ys).toFixed(0)}]`)
for (let y = 0; y < H; y++) {
  let row = ''
  for (let x = 0; x < W; x++) row += ramp[Math.min(9, grid[y * W + x])]
  console.log(row)
}
console.log(`clusters:`, centroids && [...centroids.entries()].map(([c, p]) => `${c}:(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' '))