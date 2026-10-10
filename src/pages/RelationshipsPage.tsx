import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsIn, ArrowsOut, CaretDown, CaretRight, Fire, FunnelSimple, Graph, Info, MagnifyingGlass, UsersFour, X } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { DateRangePicker } from '../components/DateRangePicker'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { MetricsCard } from '../components/MetricsCard'
import { Label } from '../components/Label'
import { Change } from '../components/Change'
import { Avatar } from '../components/Avatar'
import { Menu, MenuItem } from '../components/Menu'
import { metricInfo } from '../help'
import { endDate } from '../data'
import { getMemberAvatar } from '../avatars'
import { formatNumber } from '../analytics'
import { relationships, influenceEngine } from '../relationships'
import { FILTER_OPTIONS, NetworkGraph, type GraphFilter, type MemberFilter, type NetworkGraphHandle } from '../components/NetworkGraph'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000

export function RelationshipsPage({ range, custom, onSelectPreset, onSelectRange, active = true, focusMemberId, onFocusConsumed }: RangeProps & { active?: boolean; focusMemberId?: string | null; onFocusConsumed?: () => void }) {
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range
  const rel = useMemo(() => {
    const end = custom ? custom.to.getTime() : endDate.getTime()
    const start = custom ? custom.from.getTime() : end - range * DAY
    return relationships(start, end)
  }, [range, custom])

  // Influence Score is pinned to the shared 28-day engine (matching the
  // activity-level window) so People, this card and the member popup agree.
  // The "connections" sublabel reflects the visible graph window via rel.degree.
  const influencers = useMemo(() => influenceEngine().influencers.slice(0, 5), [])
  const [filter, setFilter] = useState<GraphFilter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [memberFilter, setMemberFilter] = useState<MemberFilter>({ cluster: null, minDegree: null })
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const graphRef = useRef<NetworkGraphHandle>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const [popOpen, setPopOpen] = useState(false)
  const [popMatches, setPopMatches] = useState<{ id: string; name: string; username: string | null; clusterId: number; degree: number }[]>([])

  useEffect(() => {
    if (search.trim() === '') {
      setPopOpen(false)
      setPopMatches([])
      return
    }
    setPopMatches((graphRef.current?.matches() ?? []).slice(0, 8))
    setPopOpen(true)
  }, [search])

  useEffect(() => {
    if (!popOpen) return
    const close = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setPopOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [popOpen])

  const pickMatch = (id: string) => {
    graphRef.current?.activate()
    setSelected(id)
    graphRef.current?.flyTo(id)
    setPopOpen(false)
  }

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') setPopOpen(false)
    if (e.key === 'Enter' && popMatches.length > 0) pickMatch(popMatches[0].id)
  }

  const [menuOpen, setMenuOpen] = useState(false)
  const [graphReady, setGraphReady] = useState(false)
  const selectRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => { if (selectRef.current && !selectRef.current.contains(e.target as Node)) setMenuOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  const [filterOpen, setFilterOpen] = useState(false)
  const [flowSub, setFlowSub] = useState<null | 'conn' | 'clusters'>(null)
  const flowRef = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [fullscreen])
  // Page stays mounted across navigation; exit fullscreen (and restore body
  // overflow) the moment the graph is no longer the active page, and return
  // the graph to its idle (non-interactive) state.
  useEffect(() => { if (!active) { setFullscreen(false); graphRef.current?.deactivate() } }, [active])
  // Deep link from a member profile's "Explore relationships" CTA: once this
  // page is active with a pending member and the graph engine exists, light the
  // ego network and fly to them. The page is mounted lazily on this navigation,
  // so the engine may not exist yet — `graphReady` (set by NetworkGraph's
  // onReady) holds the deep link until it does. The rAF waits a frame so the
  // engine's first layout has had a chance to settle.
  const focusConsumedRef = useRef(onFocusConsumed)
  focusConsumedRef.current = onFocusConsumed
  useEffect(() => {
    if (!focusMemberId || !active || !graphReady) return
    const raf = requestAnimationFrame(() => {
      graphRef.current?.activate()
      setSelected(focusMemberId)
      graphRef.current?.flyTo(focusMemberId)
      focusConsumedRef.current?.()
    })
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMemberId, active, graphReady])
  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => { if (flowRef.current && !flowRef.current.contains(e.target as Node)) { setFilterOpen(false); setFlowSub(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen])

  const activeLabel = FILTER_OPTIONS.find((o) => o.v === filter)!.label

  const connLevels = useMemo(() => {
    const degrees = [...rel.degree.values()].sort((a, b) => a - b)
    if (degrees.length === 0) return [5, 10, 15, 25, 50]
    const pct = (q: number) => {
      const idx = Math.min(degrees.length - 1, Math.max(0, Math.round(degrees.length * q) - 1))
      return degrees[idx] ?? 0
    }
    const qs = [0.7, 0.82, 0.92, 0.97, 0.99].map(q => pct(q))
    const out: number[] = []
    for (const raw of qs) {
      let v = Math.max(5, Math.ceil(raw / 5) * 5)
      const prev = out.length ? out[out.length - 1] : 0
      if (v <= prev) v = prev + 5
      out.push(v)
    }
    return out
  }, [rel])

  const memVisible = (id: string, mf: MemberFilter) => {
    if (mf.minDegree !== null && (rel.degree.get(id) ?? 0) < mf.minDegree) return false
    if (mf.cluster !== null && (rel.memberInfo.get(id)?.clusterId ?? -1) !== mf.cluster) return false
    return true
  }

  const clearSelection = () => { setSelected(null); setFilter('all') }

  const handleSelect = (id: string | null) => {
    if (id === null) { clearSelection(); return }
    if (!memVisible(id, memberFilter)) return
    // Click selects the member: no camera move, the ego-focus reducers light
    // the member and its direct relationships while the popup opens.
    setSelected(id)
  }

  const applyConn = (v: number | null) => {
    graphRef.current?.activate()
    const mf: MemberFilter = { ...memberFilter, minDegree: v }
    setMemberFilter(mf)
    if (selected && !memVisible(selected, mf)) clearSelection()
    setFilterOpen(false); setFlowSub(null)
  }

  const applyCluster = (c: number | null) => {
    graphRef.current?.activate()
    const mf: MemberFilter = { ...memberFilter, cluster: c }
    setMemberFilter(mf)
    if (selected && !memVisible(selected, mf)) clearSelection()
    setFilterOpen(false); setFlowSub(null)
  }

  const priorLinks = rel.totalLinks - rel.linksDelta
  const linksPct = priorLinks > 0 ? (rel.linksDelta / priorLinks) * 100 : 0
  const priorConnected = rel.connectedCount - rel.connectedDelta
  const connectedPct = priorConnected > 0 ? (rel.connectedDelta / priorConnected) * 100 : 0
  const priorLess = rel.totalMembers - priorConnected
  const lessPct = priorLess > 0 ? (-rel.connectedDelta / priorLess) * 100 : 0
  const priorAvg = rel.avgConnections - rel.avgConnectionsDelta
  const avgPct = priorAvg > 0 ? (rel.avgConnectionsDelta / priorAvg) * 100 : 0
  // With a member selected, the metric reports that member's own degree instead
  // of the community total. The Change and tooltip are community-scoped, so both
  // are dropped while a selection is active.
  const selInfo = selected ? rel.memberInfo.get(selected) : undefined
  return <>
    <PageHeader collapsible title="Relationships" subtitle="Understand how members connect, influence and bridge your community" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />} />
    <MetricsCard title="Network summary" stats={[
      { label: 'Connected members', info: metricInfo['Connected members'], value: formatNumber(rel.connectedCount), change: { v: connectedPct, range: effDays } },
      { label: 'Weak connected members', info: metricInfo['Weak connected members'], value: formatNumber(rel.lessConnectedCount), change: { v: lessPct, range: effDays } },
      { label: 'Avg. connections per member', info: metricInfo['Avg. connections per member'], value: rel.avgConnections.toFixed(1), change: { v: avgPct, range: effDays } },
      { label: 'Clusters', info: metricInfo['Clusters'], value: String(rel.clusters.length) },
    ]}/>
    <Card className={fullscreen ? 'graph-card fullscreen' : 'graph-card'}>
      <div className="graph-head">
        <div className="graph-stat">
          {selInfo
            ? <><span className="stat-title graph-stat-member">{selInfo.name} — total links</span><div className="graph-stat-row"><b>{formatNumber(selInfo.degree)}</b></div></>
            : <><Label text="Total links" info={metricInfo['Total links']} /><div className="graph-stat-row"><b>{formatNumber(rel.totalLinks)}</b><Change v={linksPct} range={effDays} /></div></>}
        </div>
        <div className="graph-controls">
          {selected && <div className="graph-select" ref={selectRef}>
            <button onClick={() => { graphRef.current?.activate(); setMenuOpen((o) => !o) }} aria-haspopup="listbox" aria-expanded={menuOpen}>{activeLabel}<CaretDown size={16} /></button>
            {menuOpen && <Menu>{FILTER_OPTIONS.map((o) => <MenuItem key={o.v} label={o.label} selected={o.v === filter} onSelect={() => { graphRef.current?.activate(); setFilter(o.v); setMenuOpen(false) }} />)}</Menu>}
          </div>}
          <div className="graph-filter" ref={flowRef}>
            <button className="graph-filter-btn" aria-expanded={filterOpen} onClick={() => { graphRef.current?.activate(); setFilterOpen((o) => !o); setFlowSub(null) }}><FunnelSimple size={16} />Filter</button>
            {filterOpen && <div className="menu graph-filter-menu">
              <div className="menu-sub-row" onMouseEnter={() => setFlowSub('conn')}>
                <i className="menu-sub-icon"><Graph size={16} /></i><span className="menu-label">No. of connections</span><CaretRight size={14} className="caret" />
                {flowSub === 'conn' && <div className="menu menu-sub">
                  {connLevels.map((l) => <MenuItem key={l} label={`${l}+ connections`} selected={memberFilter.minDegree === l} onSelect={() => applyConn(l)} />)}
                  <MenuItem label="Custom" disabled />
                </div>}
              </div>
              <div className="menu-sub-row" onMouseEnter={() => setFlowSub('clusters')}>
                <i className="menu-sub-icon"><UsersFour size={16} /></i><span className="menu-label">Clusters</span><CaretRight size={14} className="caret" />
                {flowSub === 'clusters' && <div className="menu menu-sub">
                  {rel.clusters.map((c) => <MenuItem key={c.id} label={`Cluster ${c.id + 1}`} selected={memberFilter.cluster === c.id} onSelect={() => applyCluster(c.id)} />)}
                </div>}
              </div>
            </div>}
          </div>
          <div className="graph-search" ref={popRef}>
            <MagnifyingGlass size={16} /><input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={onSearchKeyDown} onFocus={() => { graphRef.current?.activate(); if (search.trim() !== '') setPopOpen(true) }} placeholder="Search by username" aria-label="Search by username" />{search !== '' && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus() }}><X size={16} /></button>}
            {popOpen && search.trim() !== '' && (
              <Menu className="graph-search-menu" role="listbox">
                {popMatches.length === 0 && <MenuItem label="No members found" disabled />}
                {popMatches.map((m) => (
                  <MenuItem key={m.id} label={
                    <span className="search-match">
                      <Avatar spec={getMemberAvatar(m.id)} name={m.name} size={24} />
                      <span className="search-match-text"><span className="search-match-name">{m.name}</span>
                        {m.username && <span className="search-match-user">@{m.username}</span>}
                      </span>
                      {m.clusterId >= 0 && <span className="search-match-cluster">Cluster {m.clusterId + 1}</span>}
                      <span className="search-match-deg">{formatNumber(m.degree)} connections</span>
                    </span>
                  } onSelect={() => pickMatch(m.id)} />
                ))}
              </Menu>
            )}
          </div>
          <button className="graph-fullscreen-btn" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={fullscreen} onClick={() => { graphRef.current?.activate(); setFullscreen((f) => !f) }}>{fullscreen ? <ArrowsIn size={16} /> : <ArrowsOut size={16} />}</button>
        </div>
      </div>
      <div className="graph-filters">
        {memberFilter.cluster !== null && <span className="filter-pill">Cluster {memberFilter.cluster + 1}<button aria-label="Clear cluster filter" onClick={() => applyCluster(null)}><X size={16} /></button></span>}
        {memberFilter.minDegree !== null && <span className="filter-pill">{memberFilter.minDegree}+ connections<button aria-label="Clear connections filter" onClick={() => applyConn(null)}><X size={16} /></button></span>}
      </div>
      <NetworkGraph ref={graphRef} data={rel} filter={filter} search={search} selected={selected} onSelect={handleSelect} memberFilter={memberFilter} onReady={() => setGraphReady(true)} />
    </Card>
    <div className="bottom-grid rel-bottom-grid">
      <Card>
        <CardTitle title="Connection distribution" />
        <div className="dist-rows">
          {(() => {
            const max = Math.max(1, ...rel.buckets.map((b) => b.count))
            return rel.buckets.map((b) => (
              <div className="dist-row" key={b.label}>
                <div className="dist-label"><span>{b.label} Connections</span></div>
                <div className="dist-bar-row">
                  <div className="dist-bar"><i style={{ width: `${(b.count / max) * 100}%` }} /></div>
                  <div className="dist-count"><b>{formatNumber(b.count)}</b><span>({Math.round((b.count / rel.totalMembers) * 100)}%)</span></div>
                </div>
              </div>
            ))
          })()}
        </div>
        <div className="dist-foot">Buckets adapt based on community size</div>
      </Card>
      <Card className="inf-card">
        <CardTitle title="Top influencers" className="card-title-gap-xs" action={<span className="info-tip" tabIndex={0}><Info size={16} /><span className="tip" role="tooltip"><span className="tip-title">What does this mean?</span><span className="tip-body">{metricInfo['Top influencers']}</span></span></span>} />
        <div className="inf-head"><span>Member name</span><span>Influence score</span></div>
        {influencers.map((inf, i) => (
          <div className="inf-row" key={inf.memberId}>
            <span className="inf-rank">{i + 1}</span>
            <span className="inf-id"><Avatar spec={getMemberAvatar(inf.memberId)} name={inf.name} size={32} /><span className="inf-names"><span className="inf-name">{inf.name}</span><span className="inf-sub">{formatNumber(rel.degree.get(inf.memberId) ?? 0)} connections</span></span></span>
            <span className="inf-score"><Fire size={16} /><b>{Math.round(inf.influence)}</b></span>
          </div>
        ))}
      </Card>
    </div>
  </>
}
