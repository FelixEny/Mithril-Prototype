import { useCallback, useEffect, useRef, useState } from 'react'
import { GraphEngine } from '../graph/renderer'
import { buildPopulation, type MemberFilterLike } from '../graph/build'
import { BENCH_SIZES, syntheticRelationships, type BenchSize } from '../graph/bench/synthetic'
import type { RelationshipsData } from '../relationships'

// Performance bench host for the WebGL relationship graph (#/bench).
//
// Drives the real GraphEngine through synthetic populations of doubling sizes,
// measures the cost drivers the product cares about —
//   layout       population build + seeded layout (cached, so `mount` below is
//                a warm mount: every subsequent refresh/refilter reuses it)
//   mount        synchronous engine construction (graph fill, atlas, init)
//   first paint  time until the first rendered frame
//   refresh      full reducer + paint pass (what every camera move triggers)
//   hover        a single hover-state refresh
//   select       a single selection-state refresh
//   search       a single search refresh over ~10 matches
//   gesture      an animated zoom with live frame timing (mean / p95 / worst)
// — and writes the results into the DOM as data attributes so a headless run
// can dump them back (see scripts/bench-graph.mjs).

interface BenchResult {
  n: number
  edges: number
  layoutMs: number
  mountMs: number
  firstPaintMs: number
  refreshMs: number
  hoverMs: number
  selectMs: number
  searchMs: number
  memMB: string
  fps: number
  meanMs: number
  p95Ms: number
  worstMs: number
  failed?: string
}

const awaitPaint = (sigma: ReturnType<GraphEngine['getSigma']>, force = true): Promise<void> =>
  new Promise((resolve) => {
    let done = false
    const h = () => {
      if (done) return
      done = true
      sigma.off('afterRender', h)
      resolve()
    }
    sigma.on('afterRender', h)
    // Guard against the paint having already fired before we subscribed:
    // scheduling a refresh guarantees an afterRender even when idle.
    if (force) sigma.refresh()
  })

const awaitRenderAt = (
  sigma: ReturnType<GraphEngine['getSigma']>,
  force = false,
): Promise<number> =>
  new Promise((resolve) => {
    let done = false
    const h = () => {
      if (done) return
      done = true
      sigma.off('afterRender', h)
      // Resolve with the render-end clock so consecutive steps can be timed
      // from frame to frame.
      resolve(performance.now())
    }
    sigma.on('afterRender', h)
    if (force) sigma.refresh()
  })

const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })

const frameStats = (timestamps: number[]): { meanMs: number; p95Ms: number; worstMs: number; fps: number } => {
  const deltas: number[] = []
  for (let i = 1; i < timestamps.length; i++) {
    const d = timestamps[i] - timestamps[i - 1]
    // A 0ms delta is a duplicate render event; keep it rather than skew tidy.
    if (d > 0) deltas.push(d)
  }
  const sorted = [...deltas].sort((a, b) => a - b)
  const mean = deltas.reduce((a, b) => a + b, 0) / Math.max(1, deltas.length)
  // Median is robust against the GC pauses that skew a gesture average; use it
  // for the headline fps so the number means "typical frame cost".
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0
  return { meanMs: mean, p95Ms: p95, worstMs: sorted[sorted.length - 1] ?? 0, fps: median > 0 ? 1000 / median : 0 }
}

export default function BenchmarkPage() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const rafRef = useRef(0)
  const busyRef = useRef(false)
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<BenchSize, BenchResult | undefined>>({} as Record<BenchSize, BenchResult | undefined>)
  const [fpsTick, setFpsTick] = useState<string>('')
  const [gestureActive, setGestureActive] = useState(false)

  const cleanup = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
  }, [])

  // Run a single size to completion and record its metrics.
  const runSize = useCallback(
    async (n: BenchSize, data: RelationshipsData) => {
      if (busyRef.current) return
      busyRef.current = true
      const host = hostRef.current
      if (!host) {
        busyRef.current = false
        return
      }
      cleanup()
      host.innerHTML = ''

      // Layout is the single biggest fixed cost of a population build; time it
      // separately by priming the same cached pipeline the engine will hit.
      const layoutFilter: MemberFilterLike = { cluster: null, minDegree: null }
      const l0 = performance.now()
      buildPopulation(data, layoutFilter)
      const layoutMs = performance.now() - l0

      const t0 = performance.now()
      let engine: GraphEngine
      try {
        engine = new GraphEngine(host, data, { onSelect: () => {} })
      } catch (err) {
        busyRef.current = false
        setResults((r) => ({ ...r, [n]: { n, edges: 0, layoutMs, mountMs: 0, firstPaintMs: 0, refreshMs: 0, hoverMs: 0, selectMs: 0, searchMs: 0, memMB: '—', fps: 0, meanMs: 0, p95Ms: 0, worstMs: 0, failed: String(err) } }))
        return
      }
      const mountMs = performance.now() - t0
      const sigma = engine.getSigma()
      const edges = engine.getGraph().size
      try {
      // First paint (finished already if afterRender fired synchronously; the
      // rAF-based await still lands within a frame of it).
      const fp0 = performance.now()
      await withTimeout(awaitPaint(sigma), 10000, 'firstPaint')
      const firstPaintMs = performance.now() - fp0

      // Full refresh (reducers + paint) at the fit tier, then a hover refresh.
      const r0 = performance.now()
      await withTimeout(awaitPaint(sigma), 10000, 'refresh')
      const refreshMs = performance.now() - r0

      const h0 = performance.now()
      engine.setHovered('m_1')
      await withTimeout(awaitPaint(sigma, true), 10000, 'hover')
      const hoverMs = performance.now() - h0
      engine.setHovered(null)
      engine.setSelected(null)

      // Selection refresh (ring + popover state) at a node that exists in every
      // synthetic population.
      const sel0 = performance.now()
      engine.setSelected('m_2')
      await withTimeout(awaitPaint(sigma, true), 10000, 'select')
      const selectMs = performance.now() - sel0
      engine.setSelected(null)

      // Search refresh over a query that resolves to a handful of matches.
      const sr0 = performance.now()
      engine.setSearch('ma')
      await withTimeout(awaitPaint(sigma, true), 10000, 'search')
      const searchMs = performance.now() - sr0
      engine.setSearch('')

      const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      const memMB = heap ? (heap.usedJSHeapSize / 1048576).toFixed(0) : '—'

      // Gesture: stepped zoom from fit down to max zoom-in, one render pass per
// step (reducers + paint). This is the per-frame cost that drives gesture FPS,
// and unlike a real camera animation it also measures deterministically under
// headless virtual time (no vsync to tick rAF).
      setGestureActive(true)
      const cam = sigma.getCamera()
      const from = cam.ratio
      const steps = 24
      // Measure a render pass and resolve with the moment it completed, so
      // consecutive steps can be timed from render-end to render-end.
      const stepTimes: number[] = []
      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        const ratio = 0.16 + (from - 0.16) * (1 - t) * (1 - t)
        const s0 = performance.now()
        cam.setState({ x: 0.5, y: 0.5, ratio })
        const endAt = await withTimeout(awaitRenderAt(sigma, true), 10000, 'gestureStep')
        stepTimes.push(endAt - s0)
        setFpsTick(`${(1000 / stepTimes[stepTimes.length - 1]).toFixed(0)} fps`)
      }
      setGestureActive(false)
      const f = frameStats(stepTimes)
      setResults((r) => ({ ...r, [n]: { n, edges, layoutMs, mountMs, firstPaintMs, refreshMs, hoverMs, selectMs, searchMs, memMB, fps: f.fps, meanMs: f.meanMs, p95Ms: f.p95Ms, worstMs: f.worstMs } }))
      } catch (err) {
        setResults((r) => ({ ...r, [n]: { n, edges, layoutMs, mountMs, firstPaintMs: 0, refreshMs: 0, hoverMs: 0, selectMs: 0, searchMs: 0, memMB: '—', fps: 0, meanMs: 0, p95Ms: 0, worstMs: 0, failed: String(err) } }))
      } finally {
        cancelAnimationFrame(rafRef.current)
        setGestureActive(false)
        busyRef.current = false
        void engine.destroy()
        if (host) host.innerHTML = ''
      }
    },
    [cleanup],
  )

  // Sequential suite runner.
  const runSuite = useCallback(
    async (max: BenchSize) => {
      if (running) return
      setRunning(true)
      for (const n of BENCH_SIZES) {
        if (n > max) break
        const data = syntheticRelationships(n)
        // Re-run the two refresh-heavy probes at a settle point so the number
        // reflects steady-state cost rather than cold start.
        await runSize(n, data)
        await new Promise((r) => setTimeout(r, 60))
      }
      setRunning(false)
    },
    [runSize, running],
  )

  useEffect(() => {
    // #/bench auto-runs 2k/5k/10k; #/bench/all runs everything; #/bench/<n>
    // runs every size up to n.
    const sizes: BenchSize[] = (() => {
      const m = window.location.hash.match(/bench\/(all|\d+)/)
      if (m) {
        if (m[1] === 'all') return [...BENCH_SIZES]
        const max = Number(m[1])
        return BENCH_SIZES.filter((s) => s <= max)
      }
      return [...BENCH_SIZES.slice(0, 3)]
    })()
    ;(async () => {
      for (const n of sizes) {
        await runSize(n, syntheticRelationships(n))
      }
    })()
    return cleanup
  }, [cleanup, runSize])

  const btn = (label: string, onClick: () => void) => (
    <button className="btn btn-secondary" disabled={running} onClick={onClick}>
      {label}
    </button>
  )

  return (
    <div className="bench">
      <div className="bench-head">
        <div>
          <h2>Graph performance bench</h2>
          <p className="bench-sub">Synthetic populations · drive the production renderer</p>
        </div>
        <div className="bench-controls">
          {btn('Run 2k–10k', () => runSuite(10000))}
          {btn('Run all sizes', () => runSuite(50000))}
          {BENCH_SIZES.map((n) =>
            btn(`${n.toLocaleString()}`, () => {
              void runSize(n, syntheticRelationships(n))
            }),
          )}
        </div>
      </div>
      <div className="bench-stage">
        <div ref={hostRef} className="bench-canvas" data-host="" />
        {gestureActive && <div className="bench-fps">gesture… {fpsTick}</div>}
      </div>
      <table className="bench-table">
        <thead>
          <tr>
            <th>nodes</th>
            <th>edges</th>
            <th>layout ms</th>
            <th>mount ms</th>
            <th>first paint ms</th>
            <th>refresh ms</th>
            <th>hover ms</th>
            <th>select ms</th>
            <th>search ms</th>
            <th>gesture fps</th>
            <th>mean/p95/worst</th>
            <th>heap MB</th>
          </tr>
        </thead>
        <tbody id="bench-rows">
          {BENCH_SIZES.map((n) => {
            const r = results[n]
            if (!r) return null
            return (
              <tr
                key={n}
                data-n={r.n}
                data-edges={r.edges}
                data-layout={r.layoutMs.toFixed(1)}
                data-mount={r.mountMs.toFixed(1)}
                data-firstpaint={r.firstPaintMs.toFixed(1)}
                data-refresh={r.refreshMs.toFixed(1)}
                data-hover={r.hoverMs.toFixed(1)}
                data-select={r.selectMs.toFixed(1)}
                data-search={r.searchMs.toFixed(1)}
                data-fps={r.fps.toFixed(0)}
                data-mean={r.meanMs.toFixed(1)}
                data-p95={r.p95Ms.toFixed(1)}
                data-worst={r.worstMs.toFixed(1)}
                data-mem={r.memMB}
                data-failed={r.failed ?? ''}
              >
                <td>{r.n.toLocaleString()}</td>
                <td>{r.edges.toLocaleString()}</td>
                <td>{r.failed ? '—' : r.layoutMs.toFixed(1)}</td>
                <td>{r.failed ? '✗' : r.mountMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.firstPaintMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.refreshMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.hoverMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.selectMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.searchMs.toFixed(1)}</td>
                <td>{r.failed ? '—' : r.fps.toFixed(0)}</td>
                <td className="bench-worst">{r.failed ? r.failed : `${r.meanMs.toFixed(1)} / ${r.p95Ms.toFixed(1)} / ${r.worstMs.toFixed(1)}`}</td>
                <td>{r.failed ? '—' : r.memMB}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}