// Headless smoke test for the Relationships page + WebGL graph.
//
// Requires the Vite dev server to be running (corepack pnpm dev) and a
// Chromium-family browser installed at the MSEDGE path below.
//
// Phase 1 dumps the DOM at mount and asserts the page renders, the sigma layer
// canvases exist, and the population is non-empty.
//
// Phase 2 drives a real member filter (Filter -> Clusters -> Cluster 1) with
// trusted input and asserts the rebuild completes. This exists because applying
// a filter used to throw NotFoundGraphError inside the engine: the reducers
// resolved node ids against the freshly-built population while sigma still
// iterated the previous one, so the rebuild died before sigma.setGraph, and the
// loading overlay never cleared because setLoading(false) sat after the throw.
// Trusted input is required -- React derives onMouseEnter from mouseover, so a
// synthetic 'mouseenter' silently does nothing and the submenu never opens.
//
// Phase 3 toggles fullscreen on and off and asserts the card never scrolls. The
// legend is a flex child of .graph-wrap, so a canvas sized with height:100%
// leaves it no room and the wrapper overflowed into a scrollbar. The canvas has
// to flex into whatever height the legend does not claim, and leaving fullscreen
// has to restore the inline layout untouched. In fullscreen the canvas drops the
// inline 1096/620 aspect ratio and fills the wrapper width instead: letterboxing
// it left the graph floating in a small centred box well short of the window.
//
// Usage: node scripts/smoke-graph.mjs [url]

import { execFileSync, spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  ['graph canvas host present', dom.includes('graph-canvas')],
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

// --- Phase 2: apply a member filter and require the rebuild to complete ------
//
// Spawns a second headless Edge and drives it over the DevTools protocol,
// because the filter only misbehaves on interaction -- the mount dump above
// cannot reach it.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function filterChecks() {
  const dir = mkdtempSync(join(tmpdir(), 'smoke-filter-'))
  const port = 9200 + Math.floor(Math.random() * 90)
  const proc = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--window-size=1600,1000',
    `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, 'about:blank',
  ])
  try {
    let target = null
    for (let i = 0; i < 80 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
        target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      } catch {}
      if (!target) await sleep(400)
    }
    if (!target) return [['filter phase: devtools reachable', false, 'no page target']]

    const ws = new WebSocket(target.webSocketDebuggerUrl)
    await new Promise((r) => (ws.onopen = r))
    let seq = 0
    const pending = new Map()
    const errors = []
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data)
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id)
        pending.delete(m.id)
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result)
      } else if (m.method === 'Runtime.exceptionThrown') {
        errors.push(String(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text))
      }
    }
    const send = (method, params = {}) => new Promise((res, rej) => {
      const n = ++seq
      pending.set(n, { res, rej })
      ws.send(JSON.stringify({ id: n, method, params }))
    })
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) return { threw: r.exceptionDetails.text }
      return r.result.value
    }
    const mouse = (type, x, y) =>
      send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseMoved' ? 0 : 1, clickCount: 1 })
    const clickAt = async (x, y) => {
      await mouse('mouseMoved', x, y)
      await sleep(90)
      await mouse('mousePressed', x, y)
      await sleep(70)
      await mouse('mouseReleased', x, y)
      await sleep(220)
    }
    const centreOf = async (selector, matchText) => {
      const finder = matchText
        ? `list.find(e=>new RegExp(${JSON.stringify(matchText)}).test(e.textContent))`
        : 'list[0]'
      return evaluate(`(()=>{const list=[...document.querySelectorAll(${JSON.stringify(selector)})];` +
        `const el=${finder};if(!el)return null;const r=el.getBoundingClientRect();` +
        `return{x:r.x+r.width/2,y:r.y+r.height/2,t:el.textContent.trim().slice(0,32)}})()`)
    }
    const state = () => evaluate(`(()=>{const w=document.querySelector('.graph-wrap');return{` +
      `wrap:!!w,loading:!!document.querySelector('.graph-loading'),` +
      `canvases:document.querySelectorAll('.graph-canvas canvas').length,` +
      `pills:[...document.querySelectorAll('.filter-pill')].map(p=>p.textContent.trim())}})()`)

    await send('Runtime.enable')
    await send('Page.enable')
    await send('Page.navigate', { url: URL })

    let mounted = false
    for (let i = 0; i < 120; i++) {
      const s = await state()
      if (s && s.wrap && !s.loading) { mounted = true; break }
      await sleep(1000)
    }
    if (!mounted) return [['filter phase: graph mounted before filtering', false, 'overlay never cleared']]

    const btn = await centreOf('.graph-filter-btn')
    if (!btn) return [['filter phase: filter button found', false, 'no .graph-filter-btn']]
    await clickAt(btn.x, btn.y)

    const clusters = await centreOf('.graph-filter-menu .menu-sub-row', 'Clusters')
    if (!clusters) return [['filter phase: Clusters submenu row found', false, 'menu did not open']]
    // Approach from outside so the pointer generates a genuine mouseover.
    await mouse('mouseMoved', clusters.x - 150, clusters.y + 50)
    await sleep(180)
    await mouse('mouseMoved', clusters.x, clusters.y)
    await sleep(650)
    await mouse('mouseMoved', clusters.x + 2, clusters.y + 1)
    await sleep(850)

    const item = await centreOf('.graph-filter-menu .menu-sub .menu-item')
    if (!item) return [['filter phase: cluster items listed', false, 'submenu never opened (hover did not register)']]
    await clickAt(item.x, item.y)

    let after = null
    for (let i = 0; i < 60; i++) {
      const s = await state()
      if (s && !s.loading && s.pills.length > 0) { after = s; break }
      await sleep(500)
    }
    const notFound = errors.filter((e) => /NotFoundGraphError|getNodeAttributes/.test(e))
    const out = [
      ['filter applied: pill rendered', !!after && after.pills.length > 0, after ? after.pills.join(', ') : 'no pill'],
      ['loading overlay cleared after filter', !!after && !after.loading],
      ['graph still rendered after filter', !!after && after.canvases > 0, `canvases ${after ? after.canvases : 0}`],
      ['no engine exceptions during filter rebuild', notFound.length === 0, notFound[0]?.slice(0, 120)],
    ]

    const geom = () => evaluate(`(()=>{const card=document.querySelector('.graph-card');` +
      `const wrap=document.querySelector('.graph-wrap');const cv=document.querySelector('.graph-canvas');` +
      `const lg=document.querySelector('.graph-legend');if(!card||!wrap||!cv||!lg)return null;` +
      `const cb=cv.getBoundingClientRect();return{fullscreen:card.classList.contains('fullscreen'),` +
      `wrapOverflow:wrap.scrollHeight-wrap.clientHeight,cardOverflow:card.scrollHeight-card.clientHeight,` +
      `wrapClient:wrap.clientHeight,canvasW:cb.width,canvasH:cb.height,` +
      `wrapInnerW:Math.round(wrap.clientWidth-parseFloat(getComputedStyle(wrap).paddingLeft)-parseFloat(getComputedStyle(wrap).paddingRight)),` +
      `legendSpare:Math.round(wrap.getBoundingClientRect().bottom-lg.getBoundingClientRect().bottom),` +
      `bodyOverflow:getComputedStyle(document.body).overflow}})()`)

    const fsChecks = (g, label) => [
      [`${label}: card entered fullscreen`, !!g && g.fullscreen],
      [`${label}: card does not scroll`, !!g && g.cardOverflow === 0, g ? `overflow ${g.cardOverflow}px` : 'no card'],
      [`${label}: graph wrapper does not scroll`, !!g && g.wrapOverflow === 0, g ? `overflow ${g.wrapOverflow}px` : 'no wrapper'],
      [`${label}: legend fully visible`, !!g && g.legendSpare >= 0, g && g.legendSpare < 0 ? `cut off by ${-g.legendSpare}px` : g ? `${g.legendSpare}px spare` : ''],
      [`${label}: canvas fits the wrapper`, !!g && g.canvasH <= g.wrapClient && g.canvasW > 0, g ? `${Math.round(g.canvasW)}x${Math.round(g.canvasH)} in ${g.wrapClient}px` : ''],
      [`${label}: canvas fills the wrapper width`, !!g && Math.abs(g.canvasW - g.wrapInnerW) <= 2, g ? `${Math.round(g.canvasW)}px of ${g.wrapInnerW}px` : ''],
      [`${label}: body scroll locked`, !!g && g.bodyOverflow === 'hidden', g ? g.bodyOverflow : ''],
    ]
    const toggleFullscreen = async () => {
      const b = await centreOf('.graph-fullscreen-btn')
      if (!b) return false
      await clickAt(b.x, b.y)
      await sleep(1500)
      return true
    }

    const inline = await geom()
    if (!inline) return [...out, ['fullscreen phase: geometry readable', false, 'graph nodes missing']]
    if (!(await toggleFullscreen())) {
      return [...out, ['fullscreen phase: toggle found', false, 'no .graph-fullscreen-btn']]
    }
    out.push(...fsChecks(await geom(), 'fullscreen (filtered)'))

    await toggleFullscreen()
    const back = await geom()
    out.push(
      ['exit fullscreen: card restored', !!back && !back.fullscreen],
      ['exit fullscreen: inline canvas width kept', !!back && Math.abs(back.canvasW - inline.canvasW) < 2,
        `inline ${Math.round(inline.canvasW)}px -> ${back ? Math.round(back.canvasW) : '?'}px`],
    )

    // Repeat unfiltered so the taller filters row cannot mask a bad fit.
    const clear = await centreOf('.filter-pill button')
    if (clear) {
      await clickAt(clear.x, clear.y)
      await sleep(1200)
      if (await toggleFullscreen()) {
        out.push(...fsChecks(await geom(), 'fullscreen (unfiltered)'))
        await toggleFullscreen()
      }
    }

    ws.close()
    return out
  } finally {
    proc.kill()
  }
}

const filterResults = await filterChecks()
for (const [name, ok, detail = ''] of filterResults) {
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

// A rendering crash leaves a console error on window.error; the app surfaces
// nothing then, so require the expected UI markers above to be present.
if (failed > 0) {
  console.error(`\nSmoke test failed: ${[...checks, ...filterResults].filter((c) => !c[1]).map((c) => c[0]).join(', ')}`)
  process.exit(1)
}
console.log('\nSmoke test passed.')
process.exit(0)