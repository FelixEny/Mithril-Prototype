// Headless real-time collector for the graph bench (#/bench).
//
// Launches headless Edge with a remote-debugging port, navigates to the bench
// page via the DevTools protocol, waits for the suite to finish, and reads the
// per-size timing rows back through CDP. Measured with the real system clock
// (no --virtual-time-budget), so the ms numbers are comparable to a browser
// session on the same machine.
//
// Usage: node scripts/bench-graph.mjs               (runs #/bench: 2k/5k/10k)
//        node scripts/bench-graph.mjs --max 25000   (#/bench/25000)
//        node scripts/bench-graph.mjs --all         (#/bench/all: through 50k)

import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const PORT = 9334
const allArg = process.argv.find((a) => a === '--all')
const maxIdx = process.argv.indexOf('--max')
const maxArg = process.argv.find((a) => a.startsWith('--max=')) ?? (maxIdx >= 0 ? process.argv[maxIdx + 1] : undefined)
const hash = allArg ? 'all' : maxArg ? maxArg.replace(/^--max=/, '') : ''
const URL = `http://localhost:5173#/bench${hash ? `/${hash}` : ''}`

let ws = null
const msgId = { c: 0 }
const pending = new Map()

function open(targetWs) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(targetWs)
    ws.onopen = () => resolve(ws)
    ws.onerror = (e) => reject(new Error('WS error: ' + (e.message || 'connect')))
  })
}
function send(ws, method, params = {}) {
  const id = ++msgId.c
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}
async function evalJs(ws, expr) {
  const res = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true })
  return res?.result?.value
}

async function main() {
  const userData = mkdtempSync(join(tmpdir(), 'bench-edge-'))
  const edge = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--use-angle=swiftshader',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1440,900',
    'about:blank',
  ], { stdio: 'ignore' })
  try {
    // Wait for the debugging endpoint.
    let page = null
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json`)
        const list = await res.json()
        page = list.find((t) => t.type === 'page')
        if (page) break
      } catch { /* still booting */ }
      await new Promise((r) => setTimeout(r, 250))
    }
    if (!page) throw new Error('Could not reach the remote-debugging endpoint.')

    const cdp = await open(page.webSocketDebuggerUrl)
    cdp.onmessage = (e) => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id)
        pending.delete(m.id)
        if (m.error) reject(new Error(m.error.message))
        else resolve(m.result)
      }
    }

    await send(cdp, 'Page.enable')
    await send(cdp, 'Runtime.enable')
    await send(cdp, 'Page.navigate', { url: URL })

    // Poll until the suite reports rows. Guard each await so the CDP channel
    // never hangs: race every call against a timeout.
    const timedOut = (ms, label) =>
      new Promise((_r, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms))
    const readRows = `Array.from(document.querySelectorAll('#bench-rows tr')).map((tr) => ({
      n: tr.dataset.n, edges: tr.dataset.edges, layout: tr.dataset.layout, mount: tr.dataset.mount,
      paint: tr.dataset.firstpaint, refresh: tr.dataset.refresh, hover: tr.dataset.hover,
      select: tr.dataset.select, search: tr.dataset.search, fps: tr.dataset.fps,
      mean: tr.dataset.mean, p95: tr.dataset.p95, worst: tr.dataset.worst, mem: tr.dataset.mem,
      failed: tr.dataset.failed,
    }))`

    const target = allArg ? 5 : maxArg ? BENCH_SIZES_UP_TO(Number(hash)) : 3
    let rows = []
    const maxWait = allArg || Number(hash) >= 20000 ? 900000 : 180000
    const waitDeadline = Date.now() + maxWait
    let lastCount = 0
    let lastBeat = Date.now()
    while (Date.now() < waitDeadline) {
      try {
        rows = (await Promise.race([evalJs(cdp, readRows), timedOut(8000, 'poll')])) ?? []
      } catch { rows = [] }
      if (rows.length >= target && rows.every((r) => r && r.n)) break
      if (rows.length !== lastCount) {
        lastCount = rows.length
        console.error(`progress: ${rows.length}/${target} rows`)
      }
      if (Date.now() - lastBeat > 30000) {
        lastBeat = Date.now()
        console.error(`still waiting (${Math.round((waitDeadline - Date.now()) / 1000)}s left, ${rows.length}/${target} rows)`)
      }
      await new Promise((r) => setTimeout(r, 1000))
    }

    if (rows.length < target) {
      console.error(`Only ${rows.length}/${target} bench rows were produced (${maxWait / 1000}s deadline).`)
      printRows(rows)
      process.exitCode = 2
      return
    }

    printRows(rows)
    console.log('\nBench ran clean (real clock).')
  } finally {
    if (ws) { try { ws.close() } catch { /* noop */ } }
    edge.kill()
    rmSync(userData, { recursive: true, force: true })
  }
}

function printRows(rows) {
  console.log('nodes     edges       layout   mount    paint    refresh  hover    select   search   fps     heapMB  mean/p95/worst')
  for (const r of rows) {
    if (r.failed) {
      console.log(`${String(r.n).padEnd(9)} F A I L E D  ${r.failed}`)
      continue
    }
    console.log(
      `${String(r.n).padEnd(10)} ${String(Number(r.edges).toLocaleString()).padEnd(10)} ${r.layout.padEnd(8)} ${r.mount.padEnd(8)} ${r.paint.padEnd(8)} ${r.refresh.padEnd(8)} ${r.hover.padEnd(8)} ${r.select.padEnd(8)} ${r.search.padEnd(8)} ${r.fps.padEnd(6)} ${String(r.mem).padEnd(7)} ${r.mean}/${r.p95}/${r.worst}ms`,
    )
  }
}

function BENCH_SIZES_UP_TO(n) {
  const all = [2000, 5000, 10000, 20000, 50000]
  return all.filter((s) => s <= n).length
}

main().catch((err) => {
  console.error('bench-graph failed:', err)
  process.exit(1)
})