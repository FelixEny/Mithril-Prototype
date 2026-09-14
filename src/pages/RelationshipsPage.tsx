import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretRight, Fire, FunnelSimple, Graph, Info, MagnifyingGlass, UsersFour, X } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'
import { DateRangePicker } from '../components/DateRangePicker'
import { Card } from '../components/Card'
import { CardTitle } from '../components/CardTitle'
import { Insight } from '../components/Insight'
import { Label } from '../components/Label'
import { Change } from '../components/Change'
import { Stat } from '../components/Stat'
import { Avatar } from '../components/Avatar'
import { Gauge } from '../components/Gauge'
import { Menu, MenuItem } from '../components/Menu'
import { metricInfo } from '../help'
import { endDate } from '../data'
import { getMemberAvatar } from '../avatars'
import { formatNumber } from '../analytics'
import { relationships, selectBackbone } from '../relationships'
import { FILTER_OPTIONS, NetworkGraph, type GraphFilter, type MemberFilter } from '../components/NetworkGraph'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000

const DIMENSIONS: { label: string; key: 'connectedness' | 'participation' | 'distribution' | 'relationshipQuality'; w: number; def: string }[] = [
  { label: 'Connectedness', key: 'connectedness', w: 0.35, def: 'Share of members with at least two meaningful connections — at least 2 interactions with the same member across 2 or more days.' },
  { label: 'Participation', key: 'participation', w: 0.3, def: 'Connected members who had at least one qualifying interaction with an existing connection during the selected period.' },
  { label: 'Distribution', key: 'distribution', w: 0.2, def: 'How evenly meaningful connections are spread rather than concentrated in a small group — most members having some connections scores higher.' },
  { label: 'Relationship quality', key: 'relationshipQuality', w: 0.15, def: 'Weighted average relationship strength across meaningful relationships — Strong 100, Mid 60, Weak 20.' }
]
const weightsMeta = `Weights · ${DIMENSIONS.map((d) => `${d.label} ${Math.round(d.w * 100)}%`).join(' · ')}`

export function RelationshipsPage({ range, custom, onSelectPreset, onSelectRange }: RangeProps) {
  const effDays = custom ? Math.max(1, Math.round((custom.to.getTime() - custom.from.getTime()) / DAY)) : range
  const rel = useMemo(() => {
    const end = custom ? custom.to.getTime() : endDate.getTime()
    const start = custom ? custom.from.getTime() : end - range * DAY
    return relationships(start, end)
  }, [range, custom])
  const score = Math.round(rel.strength)
  const [filter, setFilter] = useState<GraphFilter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [memberFilter, setMemberFilter] = useState<MemberFilter>({ cluster: null, minDegree: null })
  const [search, setSearch] = useState('')

  const [menuOpen, setMenuOpen] = useState(false)
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

  const baseIds = useMemo(() => selectBackbone(rel, memberFilter), [rel, memberFilter])

  const clearSelection = () => { setSelected(null); setFilter('all') }

  const handleSelect = (id: string | null) => {
    if (id === null) { clearSelection(); return }
    if (!memVisible(id, memberFilter)) return
    setSelected(id)
  }

  const applyConn = (v: number | null) => {
    const mf: MemberFilter = { ...memberFilter, minDegree: v }
    setMemberFilter(mf)
    if (selected && !memVisible(selected, mf)) clearSelection()
    setFilterOpen(false); setFlowSub(null)
  }

  const applyCluster = (c: number | null) => {
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
  const sortedDegrees = [...rel.degree.values()].sort((a, b) => b - a)
  const topSlice = sortedDegrees.slice(0, Math.max(1, Math.ceil(sortedDegrees.length * 0.1)))
  const degreeSum = sortedDegrees.reduce((a, x) => a + x, 0)
  const topShare = degreeSum > 0 ? Math.round((topSlice.reduce((a, x) => a + x, 0) / degreeSum) * 100) : 0
  const insight = (
    <>The most connected 10% of members hold <b>{topShare}%</b> of all connections.{rel.bridgeCount > 0 && <> <b>{rel.bridgeCount}</b> {rel.bridgeCount === 1 ? 'member bridges' : 'members bridge'} separate clusters.</>}</>
  )
  return <>
    <PageHeader title="Relationships" subtitle="Understand how members connect, influence and bridge your community" action={<DateRangePicker range={range} custom={custom} endDate={endDate} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />} />
    <Card className="strength-card">
      <CardTitle title="Community strength" className="metrics-title" action={<span className="strength-meta">{weightsMeta}</span>} />
      <div className="strength-body">
        <div className="strength-gauge">
          <Gauge value={score}>
            <span className="gauge-score"><b>{score}</b><span>/100</span></span>
            <span className="gauge-caption">Community score</span>
            <Change v={rel.strengthDelta} range={effDays} unit="pts" />
          </Gauge>
        </div>
        <div className="strength-rows">
          {DIMENSIONS.map((d) => {
            const v = rel[d.key]
            return (
              <div className="strength-row" key={d.label}>
                <div className="strength-row-info">
                  <div className="strength-row-title"><Label text={d.label} /><span className="strength-weight">{Math.round(d.w * 100)}% weight</span></div>
                </div>
                <div className="strength-bar"><i style={{ width: `${v}%`, background: v >= 80 ? 'var(--score-7)' : 'var(--content-brand)' }} /></div>
                <div className="strength-row-score"><b>{Math.round(v)}</b><span>/100</span></div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="strength-foot">
        <div className="strength-foot-title">What drives this score:</div>
        {DIMENSIONS.map((d) => <div className="strength-foot-row" key={d.label}><b>{d.label}:</b><span>{d.def}</span></div>)}
      </div>
    </Card>
    <Card className="graph-card">
      <div className="graph-head">
        <div className="graph-stat">
          <Label text="Total links" info={metricInfo['Total links']} />
          <div className="graph-stat-row"><b>{formatNumber(rel.totalLinks)}</b><Change v={linksPct} range={effDays} /></div>
        </div>
        <div className="graph-controls">
          {memberFilter.cluster !== null && <span className="filter-pill pill-tag"><i className="pill-icon"><UsersFour size={20} /></i><span className="pill-label">Cluster {memberFilter.cluster + 1}</span><button aria-label="Clear cluster filter" onClick={() => applyCluster(null)}><X size={16} /></button></span>}
          {memberFilter.minDegree !== null && <span className="filter-pill pill-tag"><i className="pill-icon"><Graph size={20} /></i><span className="pill-label">{memberFilter.minDegree}+ connections</span><button aria-label="Clear connections filter" onClick={() => applyConn(null)}><X size={16} /></button></span>}
          {selected && <div className="graph-select" ref={selectRef}>
            <button onClick={() => setMenuOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={menuOpen}>{activeLabel}<CaretDown size={16} /></button>
            {menuOpen && <Menu>{FILTER_OPTIONS.map((o) => <MenuItem key={o.v} label={o.label} selected={o.v === filter} onSelect={() => { setFilter(o.v); setMenuOpen(false) }} />)}</Menu>}
          </div>}
          <div className="graph-filter" ref={flowRef}>
            <button className="graph-filter-btn" aria-expanded={filterOpen} onClick={() => { setFilterOpen((o) => !o); setFlowSub(null) }}><FunnelSimple size={16} />Filter</button>
            {filterOpen && <div className="menu graph-filter-menu">
              <div className="menu-sub-row" onMouseEnter={() => setFlowSub('conn')}>
                <span className="menu-label">No. of connections</span><CaretRight size={14} className="caret" />
                {flowSub === 'conn' && <div className="menu menu-sub">
                  <MenuItem label="Entire network" selected={memberFilter.minDegree === null} onSelect={() => applyConn(null)} />
                  {connLevels.map((l) => <MenuItem key={l} label={`${l}+ connections`} selected={memberFilter.minDegree === l} onSelect={() => applyConn(l)} />)}
                  <MenuItem label="Custom" className="menu-item-disabled" />
                </div>}
              </div>
              <div className="menu-sub-row" onMouseEnter={() => setFlowSub('clusters')}>
                <span className="menu-label">Clusters</span><CaretRight size={14} className="caret" />
                {flowSub === 'clusters' && <div className="menu menu-sub">
                  {rel.clusters.map((c) => <MenuItem key={c.id} label={`Cluster ${c.id + 1}`} selected={memberFilter.cluster === c.id} onSelect={() => applyCluster(c.id)} />)}
                </div>}
              </div>
            </div>}
          </div>
          <div className="graph-search"><MagnifyingGlass size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by username" aria-label="Search by username" /></div>
        </div>
      </div>
      <NetworkGraph data={rel} filter={filter} search={search} selected={selected} onSelect={handleSelect} memberFilter={memberFilter} baseIds={baseIds} />
    </Card>
    <Card className="metrics">
      <CardTitle title="Network summary" className="metrics-title" />
      <div className="metric-row">
        <div className="metric"><Stat layout="below" label="Connected members" info={metricInfo['Connected members']} value={formatNumber(rel.connectedCount)} change={{ v: connectedPct, range: effDays, caption: 'vs last period' }} /></div>
        <div className="metric"><Stat layout="below" label="Weak connected members" info={metricInfo['Weak connected members']} value={formatNumber(rel.lessConnectedCount)} change={{ v: lessPct, range: effDays, caption: 'vs last period' }} /></div>
        <div className="metric"><Stat layout="below" label="Avg. connections per member" info={metricInfo['Avg. connections per member']} value={rel.avgConnections.toFixed(1)} change={{ v: avgPct, range: effDays, caption: 'vs last period' }} /></div>
        <div className="metric"><Stat layout="below" label="Clusters" info={metricInfo['Clusters']} value={String(rel.clusters.length)} change={{ v: 0, range: effDays, caption: 'vs last period' }} /></div>
      </div>
      <div className="metrics-insight"><Insight>{insight}</Insight></div>
    </Card>
    <div className="bottom-grid rel-bottom-grid">
      <Card>
        <CardTitle title="Connection distribution" />
        <div className="dist-rows">
          {(() => {
            const max = Math.max(1, ...rel.buckets.map((b) => b.count))
            return rel.buckets.map((b) => (
              <div className="dist-row" key={b.label}>
                <div className="dist-label"><span>{b.label} Connections</span><span className="dist-count"><b>{formatNumber(b.count)}</b><span>({Math.round((b.count / rel.totalMembers) * 100)}%)</span></span></div>
                <div className="dist-bar"><i style={{ width: `${(b.count / max) * 100}%` }} /></div>
              </div>
            ))
          })()}
        </div>
        <div className="dist-foot">Buckets adapt based on community size</div>
      </Card>
      <Card>
        <CardTitle title="Top influencers" className="card-title-gap-xs" action={<span className="info-tip" tabIndex={0}><Info size={16} /><span className="tip" role="tooltip"><span className="tip-title">What does this mean?</span><span className="tip-body">{metricInfo['Top influencers']}</span></span></span>} />
        <div className="inf-head"><span>Member name</span><span>Influence score</span></div>
        {rel.influencers.slice(0, 5).map((inf, i) => (
          <div className="inf-row" key={inf.memberId}>
            <span className="inf-rank">{i + 1}</span>
            <span className="inf-id"><Avatar spec={getMemberAvatar(inf.memberId)} name={inf.name} size={32} /><span className="inf-names"><span className="inf-name">{inf.name}</span><span className="inf-sub">{formatNumber(inf.connections)} connections</span></span></span>
            <span className="inf-score"><Fire size={20} weight="fill" /><b>{Math.round(inf.influence)}</b></span>
          </div>
        ))}
      </Card>
    </div>
  </>
}
