// Headless smoke test for the Relationships page + WebGL graph.
//
// Requires the Vite dev server to be running (corepack pnpm dev) and a
// Chromium-family browser installed at the MSEDGE path below. Launches a
// headless Edge at the graph page and asserts the page mounts, the sigma
// layer canvases render, and the graph population is non-empty.
//
// Usage: node scripts/smoke-graph.mjs [url]

import { execFileSync } from 'node:child_process'
import process from 'node:process'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const URL = process.argv[2] || 'http://localhost:5173#/relationships'

const dom = execFileSync(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--use-angle=swiftshader',
  '--virtual-time-budget=12000',
  '--window-size=1440,900',
  '--dump-dom',
  URL,
], { encoding: 'utf8' })

const canvases = (dom.match(/<canvas\b[^>]*>/g) || []).length
const layers = ['sigma-edges', 'sigma-edgeLabels', 'sigma-nodes', 'sigma-labels', 'sigma-hovers', 'sigma-hoverNodes', 'sigma-mouse']
const checks = [
  ['page rendered', dom.includes('class="page-panel"')],
  ['graph canvas host present', dom.includes('class="graph-canvas"')],
  ['all 7 sigma layers rendered', layers.every((l) => dom.includes(`class="${l}"`))],
  ['at least 6 gl layers', canvases >= 6, `got ${canvases}`],
  ['population non-empty (hint rendered)', dom.includes('class="graph-hint"')],
  ['no empty-graph placeholder', !dom.includes('class="graph-empty"')],
  ['loading overlay hidden after mount', !dom.includes('class="graph-loading"')],
  ['halos moved in-shader (no legacy 2D halo layer)', !dom.includes('graph-halos')],
  ['strength/links header present', dom.includes('Total links')],
  ['no crash probe leftover', !dom.includes('data-graph-probe')],
]

let failed = 0
for (const [name, ok, detail = ''] of checks) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// A rendering crash leaves a console error on window.error; the app surfaces
// nothing then, so require the expected UI markers above to be present.
if (failed > 0) {
  console.error(`\nSmoke test failed: ${checks.filter((c) => !c[1]).map((c) => c[0]).join(', ')}`)
  process.exit(1)
}
console.log('\nSmoke test passed.')
process.exit(0)