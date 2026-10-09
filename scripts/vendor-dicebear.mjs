// Vendors the DiceBear Adventurer avatars used by the graph into
// public/avatars/dicebear as 128x128 PNGs (matching the atlas CELL size).
//
// The avatar mix in src/avatars.ts is deterministic: each member id hashes to a
// seed + palette colour. This script mirrors that logic, fetches each distinct
// SVG from the DiceBear API once, and rasterizes it locally so the app never
// depends on a third-party host at runtime.
//
// Rasterization notes:
// - The API is called with radius=50, so the artwork is a circle with
//   transparent corners (~78.5% opaque). The graph's avatarImageIsUsable()
//   guard requires >=90% opaque pixels, so each PNG is composited over an
//   opaque rectangle of the avatar's own background colour. Corners are never
//   visible: the node shader discards outside the disc and .avatar clips to
//   border-radius:50%.
// - Idempotent: existing non-empty PNGs are skipped (pass --force to redo).
//
// Usage: node scripts/vendor-dicebear.mjs [--force]

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public', 'avatars', 'dicebear')
const MEMBERS = join(ROOT, 'src', 'data', 'members.json')
const SIZE = 128
const BATCH = 16
const FORCE = process.argv.includes('--force')

// --- Mirror of src/avatars.ts -----------------------------------------------
// hashId, avatarPalette and the kind thresholds must stay byte-identical to
// the app, or the vendored filenames will not match what avatarFor() requests.
const avatarPalette = ['#693CF3', '#009A47', '#008EFF', '#FDAB00', '#3CAA9F', '#E5484D']
const hashId = (id) => {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}
const isDicebear = (id) => { const r = hashId(id) % 100; return r >= 45 && r < 60 }
const dicebearUrl = (seed, color) =>
  `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=${color.slice(1)}&radius=50`
const outName = (seed, color) => `dicebear_${seed}_${color.slice(1)}.png`
// -----------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
]

async function fetchSvg(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const text = await res.text()
      if (!text.includes('<svg')) throw new Error('not an SVG')
      return text
    } catch (error) {
      if (attempt === 2) throw error
      await sleep(500 * (attempt + 1))
    }
  }
}

// DiceBear SVGs carry a viewBox but no width/height; give them explicit pixel
// dimensions so Image.decode() and drawImage() scale them predictably.
function withIntrinsicSize(svg) {
  if (/<svg[^>]*\swidth=/.test(svg)) return svg
  const m = svg.match(/viewBox="([\d.\s-]+)"/)
  if (!m) return svg
  const [, x, y, w, h] = m[1].trim().split(/\s+/).map(Number)
  if (!Number.isFinite(w) || !Number.isFinite(h)) return svg
  return svg.replace('<svg ', `<svg width="${w}" height="${h}" `)
}

async function launchEdge() {
  const edge = EDGE_CANDIDATES.find((p) => existsSync(p))
  if (!edge) throw new Error('msedge.exe not found')
  const port = 9400 + Math.floor(Math.random() * 80)
  const proc = spawn(edge, [
    '--headless=new', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--no-sandbox', '--window-size=400,400',
    `--remote-debugging-port=${port}`, `--user-data-dir=${join(ROOT, 'node_modules', '.cache', 'vendor-dicebear-edge')}`,
    'about:blank',
  ])
  let target = null
  for (let i = 0; i < 80 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    } catch { /* browser not up yet */ }
    if (!target) await sleep(400)
  }
  if (!target) { proc.kill(); throw new Error('No debuggable Edge page target') }

  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { res, rej } = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) rej(new Error(JSON.stringify(message.error)))
      else res(message.result)
    }
  }
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq
    pending.set(id, { res, rej })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'evaluate failed')
    return result.result.value
  }
  return { proc, ws, evaluate, close: () => { try { ws.close() } catch {} ; try { proc.kill() } catch {} } }
}

// Draw the SVG over an opaque background of the avatar colour and export PNG.
const RASTERIZE = (items) => (async () => {
  const out = []
  for (const it of items) {
    try {
      const blob = new Blob([it.svg], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.src = url
      await img.decode()
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = it.color
      ctx.fillRect(0, 0, 128, 128)
      ctx.drawImage(img, 0, 0, 128, 128)
      URL.revokeObjectURL(url)
      out.push(canvas.toDataURL('image/png'))
    } catch {
      out.push(null)
    }
  }
  return out
})()

async function main() {
  const members = JSON.parse(readFileSync(MEMBERS, 'utf8'))
  const wanted = new Map()
  for (const member of members) {
    if (!isDicebear(member.id)) continue
    const seed = String(hashId(member.id) >>> 0)
    const color = avatarPalette[hashId(member.id) % avatarPalette.length]
    wanted.set(outName(seed, color), { seed, color })
  }

  const missing = [...wanted.entries()].filter(([name]) =>
    FORCE || !existsSync(join(OUT_DIR, name)) || statSync(join(OUT_DIR, name)).size === 0)
  console.log(`dicebear avatars: ${wanted.size} distinct, ${missing.length} to fetch` +
    (missing.length < wanted.size ? ` (${wanted.size - missing.length} already present)` : ''))
  if (missing.length === 0) return

  mkdirSync(OUT_DIR, { recursive: true })

  const edge = await launchEdge()
  let done = 0
  let failed = 0
  try {
    for (let i = 0; i < missing.length; i += BATCH) {
      const batch = missing.slice(i, i + BATCH)
      const svgs = await Promise.all(
        batch.map(async ([name, { seed, color }]) => {
          try {
            return { name, color: color, svg: withIntrinsicSize(await fetchSvg(dicebearUrl(seed, color))) }
          } catch (error) {
            failed++
            console.error(`  fetch failed for ${name}: ${error.message}`)
            return null
          }
        }))
      const fetchable = svgs.filter(Boolean)
      if (fetchable.length === 0) continue
      const pngs = await edge.evaluate(`(${RASTERIZE.toString()})(${JSON.stringify(fetchable)})`)
      fetchable.forEach((item, index) => {
        const dataUrl = pngs[index]
        if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) {
          failed++
          console.error(`  rasterize failed for ${item.name}`)
          return
        }
        writeFileSync(join(OUT_DIR, item.name), Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'))
        done++
      })
      console.log(`  ${done + failed}/${missing.length}`)
    }
  } finally {
    edge.close()
  }

  console.log(`dicebear vendored: ${done} written, ${failed} failed`)
  if (failed > 0) process.exitCode = 1
}

await main()
