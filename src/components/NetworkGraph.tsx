import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsOutSimple, Minus, Plus } from '@phosphor-icons/react'
import { getMemberAvatar } from '../avatars'
import type { RelationshipEdge, RelationshipsData } from '../relationships'
import { MemberPopup } from './MemberPopup'

export type GraphFilter = 'all' | 'strong' | 'mid' | 'weak'
export const FILTER_OPTIONS: { v: GraphFilter; label: string }[] = [
  { v: 'all', label: 'All connections' },
  { v: 'strong', label: 'Strong connections' },
  { v: 'mid', label: 'Mid connections' },
  { v: 'weak', label: 'Weak connections' },
]
export type MemberFilter = { cluster: number | null; minDegree: number | null }

const W = 1096
const H = 520
const VIEW_MAX_EDGES = 800
const IDLE_MS = 4000
const SIZES = [24, 30, 38, 46, 54]

const TIERS = [
  { k: 1, top: 0, full: false },
  { k: 1.45, top: 0, full: false },
  { k: 2.1, top: 350, full: false },
  { k: 3.5, top: 0, full: true },
]
const tierFor = (k: number): number => {
  let t = 0
  for (let i = 0; i < TIERS.length; i++) if (k >= TIERS[i].k) t = i
  return t
}

function sizeForDegree(deg: number): number {
  if (deg >= 151) return 54
  if (deg >= 76) return 46
  if (deg >= 31) return 38
  if (deg >= 11) return 30
  return 24
}

const mulberry32 = (seed: number) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

interface Pt { x: number; y: number }

function computeLayout(data: RelationshipsData, ids: string[]): Map<string, Pt> {
  const byCluster = new Map<number, string[]>()
  for (const id of ids) {
    const c = data.memberInfo.get(id)?.clusterId ?? -1
    const arr = byCluster.get(c)
    if (arr) arr.push(id)
    else byCluster.set(c, [id])
  }
  const cx = W / 2
  const cy = H / 2
  const clusterIds = [...byCluster.keys()].filter((c) => c >= 0).sort((a, b) => byCluster.get(b)!.length - byCluster.get(a)!.length)
  const centroids = new Map<number, Pt>()
  if (clusterIds.length === 1 && byCluster.size === 1) {
    centroids.set(clusterIds[0], { x: cx, y: cy })
  } else {
    clusterIds.forEach((c, i) => {
      const a = (i / Math.max(1, clusterIds.length)) * Math.PI * 2 - Math.PI / 2
      const r = Math.min(W, H) * 0.3
      centroids.set(c, { x: cx + Math.cos(a) * r * 1.4, y: cy + Math.sin(a) * r })
    })
  }
  centroids.set(-1, { x: cx, y: cy })
  const pos = new Map<string, Pt>()
  const rand = mulberry32(42)
  for (const [c, members] of byCluster) {
    const cent = centroids.get(c)!
    const spread = c === -1 ? 170 : Math.max(84, Math.sqrt(members.length) * 34)
    members.forEach((id, i) => {
      const r = spread * Math.sqrt((i + 0.5) / members.length)
      const a = i * 2.39996 + (rand() - 0.5) * 0.6
      pos.set(id, { x: cent.x + Math.cos(a) * r, y: cent.y + Math.sin(a) * r * 0.85 })
    })
  }
  const arr = ids.map((id) => ({ id, p: pos.get(id)! }))
  const iters = ids.length > 1200 ? 8 : ids.length > 600 ? 15 : 30
  for (let k = 0; k < iters; k++) {
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i]
      const cent = centroids.get(data.memberInfo.get(a.id)?.clusterId ?? -1)!
      let fx = (cent.x - a.p.x) * 0.02
      let fy = (cent.y - a.p.y) * 0.02
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue
        const b = arr[j]
        const dx = a.p.x - b.p.x
        const dy = a.p.y - b.p.y
        if (dx > 40 || dx < -40 || dy > 40 || dy < -40) continue
        const d2 = dx * dx + dy * dy
        if (d2 < 1 || d2 > 1600) continue
        const f = 42 / d2
        const d = Math.sqrt(d2)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }
      a.p.x = Math.min(W - 20, Math.max(20, a.p.x + fx))
      a.p.y = Math.min(H - 20, Math.max(20, a.p.y + fy))
    }
  }
  return pos
}

export function NetworkGraph({ data, filter, search, selected, onSelect, memberFilter, baseIds }: {
  data: RelationshipsData
  filter: GraphFilter
  search: string
  selected: string | null
  onSelect: (id: string | null) => void
  memberFilter: MemberFilter
  baseIds: string[]
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  const view = useRef({ k: 1, x: 0, y: 0 })
  const [armed, setArmed] = useState(false)
  const armedRef = useRef(false)
  const idleTimer = useRef<number | null>(null)
  const setArmedState = (v: boolean) => { armedRef.current = v; setArmed(v) }
  const resetIdle = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => setArmedState(false), IDLE_MS)
  }
  const arm = () => { setArmedState(true); resetIdle() }
  const deactivate = () => {
    if (idleTimer.current) window.clearTimeout(idleTimer.current)
    idleTimer.current = null
    setArmedState(false)
  }

  const selectedRef = useRef<string | null>(null)
  useEffect(() => { selectedRef.current = selected }, [selected])
  const hoverRef = useRef<string | null>(null)

  const passesFilter = (id: string) => {
    const mi = data.memberInfo.get(id)
    if (!mi) return false
    if ((data.degree.get(id) ?? 0) <= 0) return false
    if (memberFilter.cluster !== null && mi.clusterId !== memberFilter.cluster) return false
    if (memberFilter.minDegree !== null && (data.degree.get(id) ?? 0) < memberFilter.minDegree) return false
    return true
  }

  const visible = useMemo(() => new Set(baseIds.filter(passesFilter)), [baseIds, data, memberFilter])

  const [tier, setTier] = useState(0)
  const tierRef = useRef(0)

  const rankedPool = useMemo(() => {
    const arr: string[] = []
    for (const id of data.degree.keys()) if (passesFilter(id)) arr.push(id)
    arr.sort((a, b) => (data.memberInfo.get(b)?.influence ?? 0) - (data.memberInfo.get(a)?.influence ?? 0) || (a < b ? -1 : 1))
    return arr
  }, [data, memberFilter])

  const lodIds = useMemo(() => {
    if (tier < 2) return []
    const t = TIERS[tier]
    const count = t.full ? rankedPool.length : Math.max(0, t.top)
    return rankedPool.slice(0, count)
  }, [tier, rankedPool])

  const searchHits = useMemo(() => {
    const q = search.trim().toLowerCase()
    const hits = new Set<string>()
    if (!q) return hits
    for (const id of data.degree.keys()) {
      if (!passesFilter(id)) continue
      if ((data.memberInfo.get(id)?.name.toLowerCase() ?? '').includes(q)) hits.add(id)
    }
    return hits
  }, [search, data, memberFilter])

  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [revealPos, setRevealPos] = useState<Map<string, Pt>>(() => new Map())
  const revealPosRef = useRef<Map<string, Pt>>(new Map())
  useEffect(() => { revealPosRef.current = revealPos }, [revealPos])

  const labelsRef = useRef<SVGGElement>(null)
  const labelBase = useRef<Map<string, { x: number; y: number; r: number; deg: number }>>(new Map())

  const laidOut = useMemo(() => {
    const s = new Set<string>()
    for (const id of visible) s.add(id)
    for (const id of searchHits) s.add(id)
    for (const id of lodIds) s.add(id)
    return [...s].sort()
  }, [visible, searchHits, lodIds])

  const layout = useMemo(() => computeLayout(data, rankedPool), [data, rankedPool])

  const positioned = useMemo(() => {
    const s = new Set<string>(laidOut)
    for (const id of revealed) if (revealPos.has(id)) s.add(id)
    return s
  }, [laidOut, revealed, revealPos])

  const renderIds = useMemo(() => [...positioned].sort(), [positioned])

  const adjFull = useMemo(() => {
    const m = new Map<string, Set<string>>()
    const list = filter === 'all' ? data.edges : data.edges.filter((e) => e.label === filter)
    for (const e of list) {
      let sa = m.get(e.a); if (!sa) { sa = new Set(); m.set(e.a, sa) }
      let sb = m.get(e.b); if (!sb) { sb = new Set(); m.set(e.b, sb) }
      sa.add(e.b); sb.add(e.a)
    }
    return m
  }, [data, filter])

  useEffect(() => {
    if (!selected) { setRevealed(new Set()); setRevealPos(new Map()); return }
    const nb = new Set<string>()
    for (const id of adjFull.get(selected) ?? []) if (passesFilter(id)) nb.add(id)
    setRevealed(nb)
    const selPos = layout.get(selected) ?? revealPosRef.current.get(selected)
    if (!selPos || nb.size === 0) { setRevealPos(new Map()); return }
    const pos = new Map<string, Pt>()
    const R = Math.min(150, 30 + nb.size * 3.2)
    const golden = 2.39996323
    let i = 0
    for (const id of nb) {
      if (layout.has(id)) continue
      const a = i * golden + 0.3
      pos.set(id, {
        x: Math.min(W - 8, Math.max(8, selPos.x + Math.cos(a) * R)),
        y: Math.min(H - 8, Math.max(8, selPos.y + Math.sin(a) * R * 0.85)),
      })
      i++
    }
    setRevealPos(pos)
  }, [selected, adjFull, memberFilter, layout])

  const posOf = (id: string) => layout.get(id) ?? revealPos.get(id)

  useEffect(() => {
    const base = new Map<string, { x: number; y: number; r: number; deg: number }>()
    for (const id of renderIds) {
      const p = posOf(id)
      if (!p) continue
      const r = sizeForDegree(data.degree.get(id) ?? 0) / 2
      base.set(id, { x: p.x, y: p.y + r, r, deg: data.degree.get(id) ?? 0 })
    }
    labelBase.current = base
  }, [renderIds, data, layout, revealPos])

  const edges = useMemo(() => {
    let list: RelationshipEdge[] = filter === 'all' ? data.edges : data.edges.filter((e) => e.label === filter)
    list = list.filter((e) => positioned.has(e.a) && positioned.has(e.b))
    if (list.length > VIEW_MAX_EDGES) list = [...list].sort((a, b) => b.score - a.score).slice(0, VIEW_MAX_EDGES)
    return list
  }, [data, filter, positioned])

  const adj = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of edges) {
      let sa = m.get(e.a); if (!sa) { sa = new Set(); m.set(e.a, sa) }
      let sb = m.get(e.b); if (!sb) { sb = new Set(); m.set(e.b, sb) }
      sa.add(e.b); sb.add(e.a)
    }
    return m
  }, [edges])

  const hidePill = () => { if (pillRef.current) pillRef.current.style.display = 'none' }

  const positionPill = (id: string) => {
    const svg = svgRef.current
    const g = gRef.current
    const root = rootRef.current
    const pill = pillRef.current
    const info = data.memberInfo.get(id)
    const p = posOf(id)
    if (!svg || !g || !root || !pill || !info || !p) return
    const r = sizeForDegree(data.degree.get(id) ?? 0) / 2
    const pt = svg.createSVGPoint()
    pt.x = p.x; pt.y = p.y - r - 14
    const ctm = g.getScreenCTM()
    const rr = root.getBoundingClientRect()
    if (!ctm) return
    const sp = pt.matrixTransform(ctm)
    pill.textContent = info.name
    pill.style.left = `${sp.x - rr.left}px`
    pill.style.top = `${sp.y - rr.top}px`
    pill.style.display = 'block'
  }

  const clearHover = () => {
    const svg = svgRef.current
    hoverRef.current = null
    if (!svg) return
    svg.classList.remove('hovering')
    svg.querySelectorAll('.hot').forEach((el) => el.classList.remove('hot'))
    applyView()
    if (selectedRef.current) positionPill(selectedRef.current)
    else hidePill()
  }

  const setHover = (id: string | null) => {
    const svg = svgRef.current
    if (!svg) return
    svg.querySelectorAll('.hot').forEach((el) => el.classList.remove('hot'))
    if (!id) { clearHover(); return }
    hoverRef.current = id
    svg.classList.add('hovering')
    const nb = adj.get(id) ?? new Set<string>()
    svg.querySelectorAll(`[data-n="${id}"]`).forEach((el) => el.classList.add('hot'))
    nb.forEach((n) => svg.querySelectorAll(`[data-n="${n}"]`).forEach((el) => el.classList.add('hot')))
    svg.querySelectorAll(`[data-a="${id}"],[data-b="${id}"]`).forEach((el) => el.classList.add('hot'))
    applyView()
    positionPill(id)
  }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.querySelectorAll('.sel').forEach((el) => el.classList.remove('sel'))
    svg.classList.toggle('selecting', !!selected)
    if (!selected) { applyView(); if (!hoverRef.current) hidePill(); return }
    const nb = adj.get(selected) ?? new Set<string>()
    svg.querySelectorAll(`[data-n="${selected}"]`).forEach((el) => el.classList.add('sel'))
    nb.forEach((n) => svg.querySelectorAll(`[data-n="${n}"]`).forEach((el) => el.classList.add('sel')))
    svg.querySelectorAll(`[data-a="${selected}"],[data-b="${selected}"]`).forEach((el) => el.classList.add('sel'))
    applyView()
  }, [selected, edges, positioned, adj])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    svg.querySelectorAll('.dim').forEach((el) => el.classList.remove('dim'))
    const q = search.trim().toLowerCase()
    if (!q) { svg.classList.remove('searching'); applyView(); return }
    svg.classList.add('searching')
    const hit = new Set<string>()
    for (const id of renderIds) {
      const name = data.memberInfo.get(id)?.name.toLowerCase() ?? ''
      if (name.includes(q)) hit.add(id)
    }
    for (const id of renderIds) if (!hit.has(id)) svg.querySelectorAll(`[data-n="${id}"]`).forEach((el) => el.classList.add('dim'))
    for (const e of edges) {
      if (!(hit.has(e.a) && hit.has(e.b))) svg.querySelectorAll(`[data-ea="${e.a}"][data-eb="${e.b}"]`).forEach((el) => el.classList.add('dim'))
    }
    const first = rankedPool.find((id) => (data.memberInfo.get(id)?.name.toLowerCase() ?? '').includes(q))
    if (first) {
      const p = posOf(first)
      if (p) {
        const k = view.current.k
        view.current = { k, x: W / 2 - p.x * k, y: H / 2 - p.y * k }
      }
    }
    applyView()
  }, [search, edges, renderIds, data, rankedPool])

  const applyView = () => {
    gRef.current?.setAttribute('transform', `translate(${view.current.x} ${view.current.y}) scale(${view.current.k})`)
    const labels = labelsRef.current
    if (labels) {
      const k = view.current.k
      const v = view.current
      for (let i = 0; i < labels.children.length; i++) {
        const el = labels.children[i]
        const b = labelBase.current.get(el.getAttribute('data-n') ?? '')
        if (!b) continue
        el.setAttribute('transform', `translate(${v.x + k * b.x} ${v.y + k * b.y + 12})`)
        const show = el.classList.contains('hot') || el.classList.contains('sel') || k * b.r >= 12 || b.deg > 20
        el.classList.toggle('hidden', !show)
      }
    }
  }
  const zoomAt = (px: number, py: number, f: number) => {
    const v = view.current
    const k2 = Math.min(3, Math.max(0.1, v.k * f))
    v.x = px - (px - v.x) * (k2 / v.k)
    v.y = py - (py - v.y) * (k2 / v.k)
    v.k = k2
    const nt = tierFor(k2)
    if (nt !== tierRef.current) { tierRef.current = nt; setTier(nt) }
    applyView()
  }
  const resetView = () => {
    view.current = { k: 1, x: 0, y: 0 }
    const nt = tierFor(1)
    if (nt !== tierRef.current) { tierRef.current = nt; setTier(nt) }
    applyView()
  }
  const fitView = () => { arm(); resetView() }

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const onWheel = (e: WheelEvent) => {
      if (!armedRef.current) return
      e.preventDefault()
      const rect = svg.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const px = (e.clientX - rect.left) * (W / rect.width)
      const py = (e.clientY - rect.top) * (H / rect.height)
      zoomAt(px, py, e.deltaY < 0 ? 1.1 : 1 / 1.1)
      resetIdle()
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    return () => svg.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const onDocDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) deactivate()
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') deactivate() }
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  useEffect(() => {
    view.current = { k: 1, x: 0, y: 0 }
    const nt = tierFor(1)
    if (nt !== tierRef.current) { tierRef.current = nt; setTier(nt) }
    applyView()
  }, [data, filter, memberFilter])

  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean; nodeId: string | null } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    if (!armedRef.current) arm()
    svgRef.current?.setPointerCapture?.(e.pointerId)
    const nodeId = (e.target as Element)?.closest?.('[data-n]')?.getAttribute('data-n') ?? null
    drag.current = { sx: e.clientX, sy: e.clientY, ox: view.current.x, oy: view.current.y, moved: false, nodeId }
    e.preventDefault()
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || !svgRef.current) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    if (!d.moved && Math.hypot(dx, dy) < 3) return
    d.moved = true
    const rect = svgRef.current.getBoundingClientRect()
    const sx = W / rect.width
    const sy = H / rect.height
    view.current.x = d.ox + dx * sx
    view.current.y = d.oy + dy * sy
    applyView()
  }
  const onPointerUp = () => {
    const d = drag.current
    const node = d?.nodeId ?? null
    drag.current = null
    resetIdle()
    if (d && !d.moved) {
      if (node) onSelect(node)
      else onSelect(null)
    }
  }
  const onPointerCancel = () => { drag.current = null }

  return (
    <div className="graph-wrap" ref={rootRef}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className={`graph-svg${armed ? ' armed' : ''}`} role="img" aria-label="Relationship graph"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onDoubleClick={armed ? resetView : undefined} onPointerLeave={() => { onPointerUp(); setHover(null) }}>
        <defs>
          {SIZES.map((s) => <clipPath key={s} id={`a-clip-${s}`}><circle r={s / 2} /></clipPath>)}
        </defs>
        <g ref={gRef}>
          <g className="gedges">
            {edges.map((e) => {
              const pa = posOf(e.a)
              const pb = posOf(e.b)
              if (!pa || !pb) return null
              return (
                <line key={`${e.a}|${e.b}`} data-ea={e.a} data-eb={e.b} data-a={e.a} data-b={e.b}
                  x1={pa.x} y1={pa.y}
                  x2={pb.x} y2={pb.y}
                  className={`gedge ${e.label}`} />
              )
            })}
          </g>
          <g className="gnodes">
            {renderIds.map((id) => {
              const p = posOf(id)
              const info = data.memberInfo.get(id)
              if (!p || !info) return null
              const size = sizeForDegree(data.degree.get(id) ?? 0)
              const r = size / 2
              const spec = getMemberAvatar(id)
              let av: React.ReactNode
              if (spec.kind === 'none') {
                av = <g className="avat"><circle r={r} fill={spec.color} /><text className="avat-init" y={1} textAnchor="middle" dominantBaseline="middle">{info.name.charAt(0).toUpperCase()}</text></g>
              } else {
                av = <g className="avat"><circle r={r} fill="var(--surface-secondary)" /><image href={spec.src ?? undefined} x={-r} y={-r} width={size} height={size} preserveAspectRatio="xMidYMid slice" clipPath={`url(#a-clip-${size})`} /></g>
              }
              return (
                <g key={id} data-n={id} transform={`translate(${p.x} ${p.y})`} className="gnode"
                  onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}>
                  {av}
                  {info.bridge && <circle r={r + 1.5} className="bridge-ring" />}
                  <circle r={r + 3} className="sel-ring" />
                  <circle r={r + 3} className="hot-ring" />
                  <circle r={r + 3} className="hit" />
                </g>
              )
            })}
          </g>
          <g className="glabels" ref={labelsRef}>
            {renderIds.map((id) => {
              const p = posOf(id)
              const info = data.memberInfo.get(id)
              if (!p || !info) return null
              const r = sizeForDegree(data.degree.get(id) ?? 0) / 2
              return (
                <text key={id} data-n={id} className="gnode-tag glabel" textAnchor="middle" dominantBaseline="middle"
                  transform={`translate(${view.current.x + view.current.k * p.x} ${view.current.y + view.current.k * (p.y + r) + 12})`}>{info.name}</text>
              )
            })}
          </g>
        </g>
      </svg>
      <div className="hover-pill" ref={pillRef} />
      {!armed && <div className="graph-hint">Click to interact with the graph</div>}
      <div className="graph-zoom">
        <button aria-label="Zoom in" onClick={() => { arm(); zoomAt(W / 2, H / 2, 1.25) }}><Plus size={16} /></button>
        <button aria-label="Zoom out" onClick={() => { arm(); zoomAt(W / 2, H / 2, 0.8) }}><Minus size={16} /></button>
        <button aria-label="Fit to view" onClick={fitView}><ArrowsOutSimple size={16} /></button>
      </div>
      {selected && <MemberPopup data={data} id={selected} onClose={() => onSelect(null)} />}
      <div className="graph-legend">
        <span className="legend-item"><i className="swatch strong" />Strong connection</span>
        <span className="legend-item"><i className="swatch mid" />Mid connection</span>
        <span className="legend-item"><i className="swatch weak" />Weak connection</span>
        <span className="legend-item"><i className="bridge-dot" />Bridge member</span>
      </div>
    </div>
  )
}