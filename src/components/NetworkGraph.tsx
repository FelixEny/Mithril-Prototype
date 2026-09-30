import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ArrowsOutSimple, Info, MagnifyingGlass, Minus, Plus } from '@phosphor-icons/react'
import type { RelationshipsData } from '../relationships'
import { GraphEngine, type GraphFilter, type AvatarDiagnostics } from '../graph/renderer'
import { Avatar } from './Avatar'
import { getMemberAvatar } from '../avatars'
import { MemberPopup } from './MemberPopup'

// Dev-only: log avatar pipeline counts as they change (identical snapshots are
// skipped so the bulk photo arrivals don't spam the console).
let lastAvatarDiag = ''
function logAvatarDiagnostics(d: AvatarDiagnostics): void {
  const s = JSON.stringify(d)
  if (s === lastAvatarDiag) return
  lastAvatarDiag = s
  console.log('[avatar-diag]', s)
}

export type { GraphFilter } from '../graph/renderer'
export const FILTER_OPTIONS: { v: GraphFilter; label: string }[] = [
  { v: 'all', label: 'All connections' },
  { v: 'strong', label: 'Strong connections' },
  { v: 'mid', label: 'Mid connections' },
  { v: 'weak', label: 'Weak connections' },
]
export type MemberFilter = { cluster: number | null; minDegree: number | null }

export interface SearchMatch {
  id: string
  name: string
  username: string | null
  clusterId: number
  degree: number
}

export interface NetworkGraphHandle {
  flyTo: (id: string) => void
  matches: () => SearchMatch[]
}

function SpanTip({ aria, title, body }: { aria: string; title: string; body: string }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={aria}>
      <Info size={16} />
      <span className="tip" role="tooltip">
        <span className="tip-title">{title}</span>
        <span className="tip-body">{body}</span>
      </span>
    </span>
  )
}

export type NetworkGraphProps = {
  data: RelationshipsData
  filter: GraphFilter
  search: string
  selected: string | null
  onSelect: (id: string | null) => void
  memberFilter: MemberFilter
}

export const NetworkGraph = forwardRef<NetworkGraphHandle, NetworkGraphProps>(function NetworkGraph({ data, filter, search, selected, onSelect, memberFilter }, ref) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<GraphEngine | null>(null)
  const [loading, setLoading] = useState(true)
  const [hover, setHover] = useState<{ id: string; name: string; username: string | null; x: number; y: number } | null>(null)

  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  const lastPop = useRef<{ data: RelationshipsData; mf: MemberFilter } | null>(null)
  const loadingTimer = useRef<number | null>(null)
  const loadingRaf = useRef<number | null>(null)
  const cancelled = useRef(false)

  // One engine per live node. data swaps below repopulate it in place.
  useEffect(() => {
    if (!rootRef.current || !canvasRef.current) return
    const instance = new GraphEngine(canvasRef.current, data, {
      onSelect: (id) => onSelectRef.current(id),
      onHover: (id, pos) => {
        if (!id || !pos) {
          setHover(null)
          return
        }
        const info = instance.getGraph().getNodeAttributes(id)
        setHover({ id, name: info.name, username: info.username ?? null, x: pos.x, y: pos.y })
      },
      onAvatarDiagnostics: import.meta.env.DEV ? logAvatarDiagnostics : undefined,
    })
    lastPop.current = { data, mf: { ...memberFilter } }
    setEngine(instance)
    // Paint the loading shell first, then drop it once the freshly-built graph
    // has had a frame to render.
    loadingRaf.current = requestAnimationFrame(() => {
      loadingRaf.current = requestAnimationFrame(() => {
        if (!cancelled.current) setLoading(false)
      })
    })
    return () => {
      cancelled.current = true
      if (loadingTimer.current !== null) clearTimeout(loadingTimer.current)
      if (loadingRaf.current !== null) cancelAnimationFrame(loadingRaf.current)
      instance.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useImperativeHandle(ref, () => ({
    flyTo: (id) => engine?.flyTo(id),
    matches: () => engine?.searchMatches() ?? [],
  }), [engine])

  // Population source / member-filter rebuild.
  useEffect(() => {
    if (!engine) return
    const prev = lastPop.current
    if (prev && prev.data === data && prev.mf.cluster === memberFilter.cluster && prev.mf.minDegree === memberFilter.minDegree) return
    setLoading(true)
    if (loadingTimer.current !== null) clearTimeout(loadingTimer.current)
    loadingTimer.current = window.setTimeout(() => {
      engine.setData(data)
      engine.applyMemberFilter({ cluster: memberFilter.cluster, minDegree: memberFilter.minDegree })
      lastPop.current = { data, mf: { ...memberFilter } }
      loadingRaf.current = requestAnimationFrame(() => {
        loadingRaf.current = requestAnimationFrame(() => {
          if (!cancelled.current) setLoading(false)
        })
      })
    }, 0)
    return () => {
      if (loadingTimer.current !== null) clearTimeout(loadingTimer.current)
    }
  }, [engine, data, memberFilter])

  useEffect(() => {
    engine?.applyFilter(filter)
  }, [engine, filter])

  useEffect(() => {
    engine?.setSelected(selected)
  }, [engine, selected])

  useEffect(() => {
    engine?.setSearch(search)
  }, [engine, search])

  useEffect(() => {
    if (engine && canvasRef.current) {
      engine.fit()
    }
  }, [engine])

  const isEmpty = engine?.isEmpty() ?? false

  return (
    <div className="graph-wrap" ref={rootRef}>
      <div className="graph-canvas" ref={canvasRef} role="img" aria-label="Relationship graph" />
      {loading && (
        <div className="graph-loading" role="status" aria-label="Building graph">
          <div className="graph-loading-spin" />
          <span className="graph-loading-label">Building graph…</span>
        </div>
      )}
      {!loading && !isEmpty && (
        <div className="graph-hint">
          <MagnifyingGlass size={14} />
          <span>Search to find members &middot; drag to explore &middot; double-click a member to reset</span>
        </div>
      )}
      {!loading && isEmpty && <div className="graph-empty">No members match the current filters</div>}
      {hover && (
        <div className="graph-hover-pill" style={{ left: hover.x, top: hover.y }}>
          <Avatar spec={getMemberAvatar(hover.id)} name={hover.name} size={24} />
          <span className="graph-pill-name">{hover.name}</span>
          {hover.username && <span className="graph-pill-user">@{hover.username}</span>}
        </div>
      )}
      <div className="graph-zoom">
        <button aria-label="Zoom in" onClick={() => engine?.zoomIn()}><Plus size={16} /></button>
        <button aria-label="Zoom out" onClick={() => engine?.zoomOut()}><Minus size={16} /></button>
        <button aria-label="Fit to view" onClick={() => engine?.fit()}><ArrowsOutSimple size={16} /></button>
      </div>
      {selected && <MemberPopup data={data} id={selected} onClose={() => onSelect(null)} />}
      <div className="graph-legend">
        <span className="legend-item"><i className="swatch strong" />Strong connection
          <SpanTip aria="What is a strong connection?" title="What does this mean?" body="Relationships with a strength score of 70–100 — frequent, recent and consistent interaction." />
        </span>
        <span className="legend-item"><i className="swatch mid" />Mid connection
          <SpanTip aria="What is a mid connection?" title="What does this mean?" body="Relationships with a strength score of 40–69 — steady contact that is a notch weaker than strong." />
        </span>
        <span className="legend-item"><i className="swatch weak" />Weak connection
          <SpanTip aria="What is a weak connection?" title="What does this mean?" body="Relationships with a strength score below 40. This describes intensity, not decline." />
        </span>
        <span className="legend-item"><i className="bridge-dot" />Bridge member
          <SpanTip aria="What is a bridge member?" title="What does this mean?" body="A member whose meaningful relationships span at least two distinct clusters, connecting otherwise separate parts of the community." />
        </span>
      </div>
    </div>
  )
})