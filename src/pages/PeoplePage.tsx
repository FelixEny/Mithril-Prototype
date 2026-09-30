import { useEffect, useMemo, useRef, useState } from 'react'
import { CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, Check, DownloadSimple, Fire, FunnelSimple, Gauge, Lightning, MagnifyingGlass, Minus, Plus, SquaresFour, Tag, X } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'

import { Avatar } from '../components/Avatar'
import { Menu, MenuCheckItem, MenuItem } from '../components/Menu'
import { getMemberAvatar } from '../avatars'
import { peopleRows, type PeopleRow } from '../people'
import { allSegments, createSegment, deleteSegment, segmentMembership, segmentSize, updateSegment, upsertSegment, userSegments } from '../segments'
import { endDate, roles, type Role, type Segment, type SegmentCriteria } from '../data'
import { TIERS, type ActivityTier } from '../analytics'
import { TierPill } from '../components/TierPill'
import { MemberProfilePage } from './MemberProfilePage'
import { SegmentActionsBar } from '../components/SegmentActionsBar'
import { Button } from '../components/Button'
import { useToast } from '../toast'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000
type SortKey = 'name' | 'influence' | 'joinedAt' | 'lastActive'
const ROWS_PER = [10, 25, 50, 100]
const SortBtn = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) => (
  <button type="button" className={`pt-sort${active ? ' active' : ''}`} onClick={onClick} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <span>{label}</span>
    {active ? (dir === 'asc' ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />) : <CaretUpDown size={16} />}
  </button>
)

function Sparkline({ series }: { series: number[] }) {
  const max = Math.max(0, ...series)
  if (max === 0) return <span className="pt-spark-empty">—</span>
  const W = 120
  const H = 15
  const pad = 1
  const pts = series.length === 1
    ? `${W / 2},${H - pad}`
    : series.map((v, i) => `${(i / (series.length - 1)) * W},${H - pad - (v / max) * (H - pad * 2)}`).join(' ')
  return <svg className="pt-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--chart-superuser)" strokeWidth={1} points={pts} /></svg>
}

const joinFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function PeoplePage({ range, custom, onSelectPreset, onSelectRange }: RangeProps) {
  const rows = useMemo(() => peopleRows(), [])
  const endMs = endDate.getTime()
  const toast = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [segmentId, setSegmentId] = useState('all')
  const [tiers, setTiers] = useState<ActivityTier[]>([])
  const [roleSel, setRoleSel] = useState<string[]>([])
  const [minInf, setMinInf] = useState<number | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState('0')
  const [smartOpen, setSmartOpen] = useState(false)
  const [smartName, setSmartName] = useState('')
  const smartRef = useRef<HTMLDivElement>(null)
  const smartInputRef = useRef<HTMLInputElement>(null)

  const [filterOpen, setFilterOpen] = useState(false)
  const [sub, setSub] = useState<null | 'tier' | 'roles' | 'influence'>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [selOpen, setSelOpen] = useState(false)
  const selRef = useRef<HTMLDivElement>(null)
  const [ppOpen, setPpOpen] = useState(false)
  const ppRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!filterOpen) return
    const close = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) { setFilterOpen(false); setSub(null) } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [filterOpen])
  useEffect(() => {
    if (!selOpen && !ppOpen) return
    const close = (e: MouseEvent) => {
      if (selRef.current && !selRef.current.contains(e.target as Node)) setSelOpen(false)
      if (ppRef.current && !ppRef.current.contains(e.target as Node)) setPpOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [selOpen, ppOpen])
  useEffect(() => {
    if (!smartOpen) return
    smartInputRef.current?.focus()
    const close = (e: MouseEvent) => { if (smartRef.current && !smartRef.current.contains(e.target as Node)) setSmartOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [smartOpen])

  const segs = allSegments()
  const seg = segmentId === 'all' ? null : segs.find((s) => s.id === segmentId) ?? null
  const removeTarget = seg && !seg.builtIn && seg.kind === 'static' ? seg : null

  const editableSegs = useMemo(() => userSegments().filter((s) => s.kind === 'static'), [])
  const selRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const segIds = seg ? new Set(segmentMembership(seg)) : null
    const out: PeopleRow[] = []
    for (const r of rows) {
      if (segIds && !segIds.has(r.id)) continue
      if (tiers.length && !tiers.includes(r.tier)) continue
      if (roleSel.length && !r.roleIds.some((id) => roleSel.includes(id))) continue
      if (minInf !== null && r.influence < minInf) continue
      if (q && !(r.name.toLowerCase().includes(q) || (r.username ?? '').toLowerCase().includes(q))) continue
      out.push(r)
    }
    return out
  }, [rows, search, seg, tiers, roleSel, minInf])

  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let c = 0
      switch (sortKey) {
        case 'name': c = a.name.localeCompare(b.name); break
        case 'influence': c = a.influence - b.influence; break
        case 'joinedAt': c = a.joinedAtMs - b.joinedAtMs; break
        case 'lastActive': c = a.lastActiveAtMs - b.lastActiveAtMs; break
      }
      return sortDir === 'asc' ? c : -c
    })
    return arr
  }, [filtered, sortKey, sortDir])

  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const cur = Math.min(page, pages)
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const slice = sorted.slice((cur - 1) * perPage, cur * perPage)

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const toggleTier = (t: ActivityTier) => setTiers((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  const toggleRole = (id: string) => setRoleSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const clampInf = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const clearFilters = () => { setTiers([]); setRoleSel([]); setMinInf(null); setSub(null) }

  const applyInf = (n: number) => { const v = clampInf(n); setMinInf(v > 0 ? v : null); setDraft(String(v)) }

  const allPageSel = slice.length > 0 && slice.every((r) => selected.has(r.id))
  const somePageSel = slice.some((r) => selected.has(r.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const nx = new Set(prev)
      if (allPageSel) slice.forEach((r) => nx.delete(r.id))
      else slice.forEach((r) => nx.add(r.id))
      return nx
    })
  }
  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const nx = new Set(prev)
      if (nx.has(id)) nx.delete(id)
      else nx.add(id)
      return nx
    })
  }

  const handleCreate = (name: string) => {
    const n = name.trim() || 'Selected members'
    const s = createSegment({ name: n, kind: 'static', memberIds: [...selected] })
    setSegmentId(s.id)
    setSelected(new Set())
    toast.push({ kind: 'success', title: 'Segment created', message: `"${n}" added to your segments` })
  }
  const handleAdd = (segId: string) => {
    const target = editableSegs.find((s) => s.id === segId)
    if (target) updateSegment(segId, { memberIds: Array.from(new Set([...(target.memberIds ?? []), ...selected])) })
    setSelected(new Set())
    toast.push({ kind: 'success', title: 'Members added', message: `${selected.size} ${selected.size === 1 ? 'member' : 'members'} added to "${target?.name ?? segId}"` })
  }
  const handleRemove = () => {
    if (!removeTarget) return
    const prev = removeTarget.memberIds ?? []
    const segId = removeTarget.id
    const n = selected.size
    const remaining = prev.filter((id) => !selected.has(id))
    setSelected(new Set())
    if (remaining.length === 0) {
      deleteSegment(segId)
      if (segmentId === segId) setSegmentId('all')
      toast.push({ kind: 'warning', title: 'Segment deleted', message: `"${removeTarget.name}" is now empty and was removed` })
      return
    }
    updateSegment(segId, { memberIds: remaining })
    toast.push({
      kind: 'success',
      title: 'Members removed',
      message: `${n} ${n === 1 ? 'member' : 'members'} removed from "${removeTarget.name}"`,
      action: { label: 'Undo', onClick: () => upsertSegment({ ...removeTarget, memberIds: prev }) },
    })
  }
  const handleCreateSmart = () => {
    const criteria: SegmentCriteria = {
      ...(tiers.length ? { activityTier: [...tiers] } : {}),
      ...(roleSel.length ? { roles: [...roleSel] } : {}),
      ...(minInf !== null ? { minInfluence: minInf } : {}),
    }
    const n = smartName.trim() || 'Smart segment'
    setSmartOpen(false)
    setSmartName('')
    if (segmentMembership({ id: 'probe', name: n, kind: 'dynamic', criteria }).length === 0) {
      toast.push({ kind: 'warning', title: 'No matching members', message: `These filters match no members, so "${n}" wasn't created` })
      return
    }
    const s = createSegment({ name: n, kind: 'dynamic', criteria })
    setSegmentId(s.id)
    clearFilters()
    toast.push({ kind: 'success', title: 'Smart segment created', message: `"${n}" started grouping members automatically` })
  }

  const pageItems = useMemo(() => {
    const items: (number | '…')[] = []
    if (pages <= 7) { for (let i = 1; i <= pages; i++) items.push(i); return items }
    items.push(1)
    if (cur > 3) items.push('…')
    for (let i = Math.max(2, cur - 1); i <= Math.min(pages - 1, cur + 1); i++) items.push(i)
    if (cur < pages - 2) items.push('…')
    items.push(pages)
    return items
  }, [pages, cur])

  const activeFilterCount = tiers.length + roleSel.length + (minInf !== null ? 1 : 0)
  const rangeStart = total === 0 ? 0 : (cur - 1) * perPage + 1
  const rangeEnd = Math.min(total, cur * perPage)

  return selectedId ? (
    <MemberProfilePage memberId={selectedId} onBack={() => setSelectedId(null)} range={range} custom={custom} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />
  ) : <>
    <PageHeader title="People" subtitle="Find and understand members of your community" action={
      <div className="ph-actions">
        <button className="people-export" type="button"><DownloadSimple size={20} />Export</button>
        {activeFilterCount > 0 && (
          <div className="seg-anchor" ref={smartRef}>
            <Button icon={<Lightning size={20} />} onClick={() => setSmartOpen((o) => !o)}>Create a smart segment</Button>
            {smartOpen && <div className="seg-dialog seg-pop" role="dialog" aria-label="Create a smart segment" aria-modal="true">
              <button type="button" className="seg-dialog-close" aria-label="Close dialog" onClick={() => setSmartOpen(false)}><X size={16} /></button>
              <h3 className="seg-dialog-title">Create a smart segment</h3>
              <p className="seg-dialog-desc">A rule-based user group that updates automatically as members&apos; activity and membership change.</p>
              <div className="seg-dialog-body">
                <input ref={smartInputRef} className="seg-input" value={smartName} placeholder="Segment name" aria-label="Segment name" onChange={(e) => setSmartName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleCreateSmart(); else if (e.key === 'Escape') setSmartOpen(false) }} />
              </div>
              <div className="seg-dialog-actions">
                <Button variant="secondary" onClick={() => setSmartOpen(false)}>Cancel</Button>
                <Button onClick={handleCreateSmart}>Create segment</Button>
              </div>
            </div>}
          </div>
        )}
      </div>
    } />
    {smartOpen && <div className="seg-scrim page" onMouseDown={() => setSmartOpen(false)} aria-hidden="true" />}
    <section className="people-page">
      <div className="people-toolbar">
        <div className="people-search"><MagnifyingGlass size={16} /><input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search by username" aria-label="Search by username" />{search !== '' && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setPage(1); searchRef.current?.focus() }}><X size={16} /></button>}</div>
        <div className="people-select" ref={selRef}>
          <button type="button" onClick={() => setSelOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={selOpen}>
            <span className="ps-label"><span>{seg ? seg.name : 'Filter by segments'}</span></span><CaretDown size={16} />
          </button>
          {selOpen && <Menu>
            {segmentId !== 'all' && <MenuItem label="All members" selected={false} onSelect={() => { setSegmentId('all'); setSelOpen(false); setPage(1) }} />}
            {[...segs].sort((a, b) => segmentSize(b) - segmentSize(a)).map((s) => (
              <MenuItem key={s.id} label={s.name} selected={s.id === segmentId} leading={s.kind === 'dynamic' ? <Lightning size={16} /> : <SquaresFour size={16} />} trailing={<span className="pp-count">{segmentSize(s)}</span>} onSelect={() => { setSegmentId(s.id); setSelOpen(false); setPage(1) }} />
            ))}
          </Menu>}
        </div>
        <div className="people-filter" ref={filterRef}>
          <button className="graph-filter-btn" type="button" aria-expanded={filterOpen} onClick={() => { setFilterOpen((o) => !o); setSub(null) }}><FunnelSimple size={16} />Filters</button>
          {filterOpen && <div className="menu people-filter-menu">
            <div className="menu-sub-row" onMouseEnter={() => setSub('tier')}>
              <i className="menu-sub-icon"><Gauge size={16} /></i><span className="menu-label">Activity level</span><CaretRight size={14} className="caret" />
              {sub === 'tier' && <div className="menu menu-sub">
                {TIERS.map((t) => <MenuCheckItem key={t} label={<TierPill tier={t} />} checked={tiers.includes(t)} onToggle={() => toggleTier(t)} />)}
              </div>}
            </div>
            <div className="menu-sub-row" onMouseEnter={() => setSub('roles')}>
              <i className="menu-sub-icon"><Tag size={16} /></i><span className="menu-label">Roles</span><CaretRight size={14} className="caret" />
              {sub === 'roles' && <div className="menu menu-sub">
                {roles.map((r: Role) => (
                  <MenuCheckItem key={r.id} label={<span className="pp-role-label"><i className="role-dot" style={{ background: r.color }} />{r.name}</span>} checked={roleSel.includes(r.id)} onToggle={() => toggleRole(r.id)} />
                ))}
              </div>}
            </div>
            <div className="menu-sub-row" onMouseEnter={() => { setSub('influence'); setDraft(String(minInf ?? 0)) }}>
              <i className="menu-sub-icon"><Fire size={16} /></i><span className="menu-label">Influence score</span><CaretRight size={14} className="caret" />
              {sub === 'influence' && <div className="menu menu-sub">
                <div className="pp-min-row">
                  <div className="pp-min-meta"><span>Minimum score</span>{minInf !== null && <button className="pp-min-clear" type="button" onClick={() => { setMinInf(null); setDraft('0') }}>Reset</button>}</div>
                  <div className="pp-stepper">
                    <button type="button" aria-label="Decrease minimum score" onClick={() => applyInf((minInf ?? 0) - 5)}><Minus size={12} /></button>
                    <input value={draft} aria-label="Minimum influence score" min={0} max={100} onChange={(e) => { const n = Number(e.target.value); setDraft(e.target.value); if (!Number.isNaN(n)) setMinInf(clampInf(n) > 0 ? clampInf(n) : null) }} onFocus={(e) => e.target.select()} />
                    <button type="button" aria-label="Increase minimum score" onClick={() => applyInf((minInf ?? 0) + 5)}><Plus size={12} /></button>
                  </div>
                  <span className="pp-min-hint">Shows members scoring {draft || (minInf ?? 0)} or higher</span>
                </div>
                {minInf !== null && <MenuItem label="Clear" onSelect={() => { setMinInf(null); setDraft('0') }} />}
              </div>}
            </div>
            {activeFilterCount > 0 && <MenuItem label="Clear all filters" onSelect={clearFilters} />}
          </div>}
        </div>
      </div>

      {(tiers.length > 0 || roleSel.length > 0 || minInf !== null) && <div className="people-pills">
        {tiers.map((t) => <span className="filter-pill" key={t}>{t}<button aria-label={`Clear ${t} filter`} onClick={() => toggleTier(t)}><X size={16} /></button></span>)}
        {roleSel.map((id) => { const r = roles.find((x) => x.id === id); return <span className="filter-pill" key={id}>{r ? r.name : id}<button aria-label={`Clear ${id} filter`} onClick={() => toggleRole(id)}><X size={16} /></button></span> })}
        {minInf !== null && <span className="filter-pill">Influence min. {minInf}<button aria-label="Clear influence filter" onClick={() => setMinInf(null)}><X size={16} /></button></span>}
      </div>}

      {total === 0
        ? <div className="pt-empty"><span>No members match your filters.</span><button type="button" onClick={() => { setSearch(''); clearFilters(); setSegmentId('all') }}>Clear filters</button></div>
        : <div className="people-table-wrap">
          <div className="people-table">
            <div className="pt-head">
              <div className="pt-cell pt-check"><button type="button" className={`pe-checkbox${somePageSel ? ' on' : ''}`} aria-label={allPageSel ? 'Deselect all on this page' : 'Select all on this page'} aria-pressed={allPageSel} onClick={toggleAll}>{somePageSel && <Check size={16} weight="bold" />}</button></div>
              <div className="pt-cell"><SortBtn label="Member" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} /></div>
              <div className="pt-cell"><span className="pt-sort-inactive">Activity level</span></div>
              <div className="pt-cell"><SortBtn label="Influence" active={sortKey === 'influence'} dir={sortDir} onClick={() => onSort('influence')} /></div>
              <div className="pt-cell"><span className="pt-sort-inactive">Roles</span></div>
              <div className="pt-cell"><SortBtn label="Joined" active={sortKey === 'joinedAt'} dir={sortDir} onClick={() => onSort('joinedAt')} /></div>
              <div className="pt-cell"><SortBtn label="Last activity" active={sortKey === 'lastActive'} dir={sortDir} onClick={() => onSort('lastActive')} /></div>
              <div className="pt-cell"><span className="pt-sort-inactive">Activity graph</span></div>
            </div>
            {slice.map((r) => {
              const picked = selected.has(r.id)
              const rest = r.roles.slice(1)
              const lastText = r.lastActiveAtMs === -Infinity ? '—' : (() => { const d = Math.floor((endMs - r.lastActiveAtMs) / DAY); return d <= 0 ? 'Today' : `${d}d ago` })()
              return <div className={`pt-row${picked ? ' selected' : ''}`} key={r.id}>
                <div className="pt-cell pt-check"><button type="button" className={`pe-checkbox${picked ? ' on' : ''}`} aria-label={`Select ${r.name}`} aria-pressed={picked} onClick={() => toggleRow(r.id)}>{picked && <Check size={16} weight="bold" />}</button></div>
                <div className="pt-cell"><div className="pt-member"><Avatar spec={getMemberAvatar(r.id)} name={r.name} size={32} /><span className="pt-names"><button type="button" className="pt-name" onClick={() => setSelectedId(r.id)}>{r.name}</button>{r.username && <span className="pt-username">@{r.username}</span>}</span></div></div>
                <div className="pt-cell"><TierPill tier={r.tier} /></div>
                <div className="pt-cell"><span className="pt-influence"><Fire size={16} /><b>{r.influence}</b></span></div>
                <div className="pt-cell"><div className="pt-roles">
                  {r.roles[0] ? <span className="role-pill"><i className="role-dot" style={{ background: r.roles[0].color }} />{r.roles[0].name}</span> : <span className="role-pill empty">&mdash;</span>}
                  {rest.length > 0 && <span className="role-pill more" tabIndex={0}>{`+${rest.length}`}<span className="tip" role="tooltip">{rest.map((n) => <span className="pp-role-label" key={n.id}><i className="role-dot" style={{ background: n.color }} />{n.name}</span>)}</span></span>}
                </div></div>
                <div className="pt-cell">{joinFmt.format(r.joinedAtMs)}</div>
                <div className="pt-cell">{lastText}</div>
                <div className="pt-cell"><Sparkline series={r.series} /></div>
              </div>
            })}
          </div>
        </div>}

      {total > 0 && <div className="people-pagination">
        <div className="pp-left">
          <div className="pp-rows" ref={ppRef}>
            <span className="pp-rl">Rows per page</span>
            <button type="button" className="pp-rv" onClick={() => setPpOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={ppOpen}>{perPage}<CaretDown size={14} /></button>
            {ppOpen && <Menu>{ROWS_PER.map((n) => <MenuItem key={n} label={String(n)} selected={perPage === n} onSelect={() => { setPerPage(n); setPpOpen(false); setPage(1) }} />)}</Menu>}
          </div>
          {total === 0 ? 'No members' : `Showing ${rangeStart}–${rangeEnd} of ${total.toLocaleString('en-US')} member${total === 1 ? '' : 's'}`}
        </div>
        <div className="pp-right">
          <button type="button" className="pp-page" aria-label="Previous page" disabled={cur === 1} onClick={() => setPage(cur - 1)}><CaretLeft size={16} /></button>
          {pageItems.map((p, i) => p === '…'
            ? <span className="pp-page dots" key={`d${i}`}>…</span>
            : <button type="button" key={p} className={`pp-page${p === cur ? ' active' : ''}`} aria-current={p === cur ? 'page' : undefined} onClick={() => setPage(p)}>{p}</button>)}
          <button type="button" className="pp-page" aria-label="Next page" disabled={cur === pages} onClick={() => setPage(cur + 1)}><CaretRight size={16} /></button>
        </div>
      </div>}
    </section>
    {selected.size > 0 && <SegmentActionsBar selected={selected} members={selRows} removeTarget={removeTarget} segments={editableSegs} onCreate={handleCreate} onAdd={handleAdd} onRemove={handleRemove} onClose={() => setSelected(new Set())} />}
  </>
}