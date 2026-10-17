import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CaretDown, CaretLeft, CaretRight, CaretUpDown, Check, DownloadSimple, Fire, FunnelSimple, Gauge, Lightning, ListNumbers, MagnifyingGlass, Minus, Plus, Selection, Tag, X } from '@phosphor-icons/react'
import { PageHeader } from '../components/PageHeader'

import { Avatar } from '../components/Avatar'
import { Menu, MenuCheckItem, MenuItem } from '../components/Menu'
import { getMemberAvatar } from '../avatars'
import { peopleRows, type PeopleRow } from '../people'
import { allSegments, createSegment, deleteSegment, segmentMembership, segmentSize, updateSegment, upsertSegment, userSegments } from '../segments'
import { endDate, roles, type Role, type Segment, type SegmentCriteria } from '../data'
import { membersToWatch, TIERS, type ActivityTier, type MemberWatchRow } from '../analytics'
import { TierPill } from '../components/TierPill'
import { MemberProfilePage } from './MemberProfilePage'
import { SegmentActionsBar } from '../components/SegmentActionsBar'
import { Button } from '../components/Button'
import { applyPeopleFilters, COMPARE_OPS, type CompareOp, type InfluenceFilter } from '../people-filters'
import { useToast } from '../toast'
import type { RangeProps } from './EngagementPage'

const DAY = 86400000
type SortKey = 'name' | 'influence' | 'joinedAt' | 'lastActive'
const ROWS_PER = [10, 25, 50, 100]
// Influence's condition list: the shared comparison operators plus Custom
// range, which swaps the stepper for from/to inputs.
const INF_OPS: { value: CompareOp | 'custom'; label: string }[] = [
  ...COMPARE_OPS,
  { value: 'custom', label: 'Custom range' },
]
const SortBtn = ({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) => (
  <button type="button" className={`pt-sort${active ? ' active' : ''}`} onClick={onClick} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <span>{label}</span>
    {active ? (dir === 'asc' ? <ArrowUp size={16} weight="bold" /> : <ArrowDown size={16} weight="bold" />) : <CaretUpDown size={16} />}
  </button>
)

function Sparkline({ series }: { series: number[] }) {
  const max = Math.max(0, ...series)
  const W = 120
  const H = 15
  const pad = 1
  if (max === 0) return <svg className="pt-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--chart-superuser)" strokeWidth={1} points={`0,${H - pad} ${W},${H - pad}`} /></svg>
  const pts = series.length === 1
    ? `${W / 2},${H - pad}`
    : series.map((v, i) => `${(i / (series.length - 1)) * W},${H - pad - (v / max) * (H - pad * 2)}`).join(' ')
  return <svg className="pt-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true"><polyline fill="none" stroke="var(--chart-superuser)" strokeWidth={1} points={pts} /></svg>
}

const joinFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function PeoplePage({ range, custom, onSelectPreset, onSelectRange, focusSegmentId, onFocusSegmentConsumed, onExploreMember }: RangeProps & { focusSegmentId?: string | null; onFocusSegmentConsumed?: () => void; onExploreMember?: (memberId: string) => void }) {
  const rows = useMemo(() => peopleRows(), [])
  const endMs = endDate.getTime()
  const toast = useToast()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [segmentId, setSegmentId] = useState('all')
  const [tiers, setTiers] = useState<ActivityTier[]>([])
  const [roleSel, setRoleSel] = useState<string[]>([])
  // Role Count / Influence: empty input = filter off, so "Exactly 0" is
  // expressible by typing 0 (which would be impossible if 0 were the inactive
  // sentinel). Influence's Custom range is empty = off as well; either bound
  // being typed activates it (the missing bound defaults to 0 / 100).
  const [rcOp, setRcOp] = useState<CompareOp>('at-least')
  const [rcDraft, setRcDraft] = useState('')
  const [infOp, setInfOp] = useState<CompareOp | 'custom'>('at-least')
  const [infDraft, setInfDraft] = useState('')
  const [infFrom, setInfFrom] = useState('')
  const [infTo, setInfTo] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [perPage, setPerPage] = useState(10)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [smartOpen, setSmartOpen] = useState(false)
  const [smartName, setSmartName] = useState('')
  const smartRef = useRef<HTMLDivElement>(null)
  const smartInputRef = useRef<HTMLInputElement>(null)

  const [filterOpen, setFilterOpen] = useState(false)
  const [sub, setSub] = useState<null | 'tier' | 'roles' | 'rolecount' | 'influence'>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const [rcOpOpen, setRcOpOpen] = useState(false)
  const rcOpRef = useRef<HTMLDivElement>(null)
  const [infOpOpen, setInfOpOpen] = useState(false)
  const infOpRef = useRef<HTMLDivElement>(null)
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
    if (!rcOpOpen) return
    const close = (e: MouseEvent) => { if (rcOpRef.current && !rcOpRef.current.contains(e.target as Node)) setRcOpOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [rcOpOpen])
  useEffect(() => {
    if (!infOpOpen) return
    const close = (e: MouseEvent) => { if (infOpRef.current && !infOpRef.current.contains(e.target as Node)) setInfOpOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [infOpOpen])
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
  // Deep link from elsewhere in the app (e.g. the Engagement page's Members to
  // watch "Create a segment" toast): select that segment and reset the table
  // so the segment's members are immediately visible.
  useEffect(() => {
    if (!focusSegmentId) return
    setSelectedId(null)
    setSearch(''); setTiers([]); setRoleSel([]); clearInfluenceDrafts(); setRcDraft(''); setSegmentId(focusSegmentId); setPage(1); setSub(null)
    onFocusSegmentConsumed?.()
  }, [focusSegmentId, onFocusSegmentConsumed])

  const segs = allSegments()
  const seg = segmentId === 'all' ? null : segs.find((s) => s.id === segmentId) ?? null
  const removeTarget = seg && !seg.builtIn && seg.kind === 'static' ? seg : null

  // Members-to-watch segments carry the window they were created for.
  // Re-running membersToWatch on that window reproduces the exact ranked rows
  // the CM saw on Engagement, so the table can show the Change story behind
  // each member instead of the default columns.
  const watchRowMap = useMemo(() => {
    const w = seg?.watchWindow
    if (!w) return null
    return new Map(membersToWatch(new Date(w.start), new Date(w.end)).map((r) => [r.id, r] as const))
  }, [seg?.watchWindow?.start, seg?.watchWindow?.end])

  const editableSegs = useMemo(() => userSegments().filter((s) => s.kind === 'static'), [])
  const selRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected])

  const clampInf = (n: number) => Math.max(0, Math.min(100, Math.round(n)))
  const roleCount = rcDraft === '' ? null : { op: rcOp, value: Math.max(0, parseInt(rcDraft, 10) || 0) }
  const rcOpLabel = COMPARE_OPS.find((o) => o.value === rcOp)?.label ?? 'At least'
  // Custom range: either bound activates it (a missing bound defaults to the
  // rest of the 0–100 span) and a swapped pair is normalized so from <= to.
  const influence: InfluenceFilter | null = infOp === 'custom'
    ? (infFrom === '' && infTo === ''
        ? null
        : (() => {
            const lo = infFrom === '' ? 0 : clampInf(parseInt(infFrom, 10) || 0)
            const hi = infTo === '' ? 100 : clampInf(parseInt(infTo, 10) || 0)
            return { from: Math.min(lo, hi), to: Math.max(lo, hi) }
          })())
    : (infDraft === '' ? null : { op: infOp, value: clampInf(parseInt(infDraft, 10) || 0) })
  const infOpLabel = INF_OPS.find((o) => o.value === infOp)?.label ?? 'At least'

  const filtered = useMemo(() => applyPeopleFilters(rows, {
    search,
    segIds: seg ? new Set(segmentMembership(seg)) : null,
    tiers,
    roleSel,
    influence,
    roleCount,
  }), [rows, search, seg, tiers, roleSel, influence, roleCount])

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

  // Watch segments display in ranked watch order (the rank is part of the
  // story); members added to the segment later trail the ranked list.
  const ordered = useMemo(() => {
    if (!watchRowMap) return null
    const byId = new Map(filtered.map((r) => [r.id, r]))
    const out: PeopleRow[] = []
    for (const [id] of watchRowMap) {
      const r = byId.get(id)
      if (r) out.push(r)
    }
    for (const r of filtered) if (!watchRowMap.has(r.id)) out.push(r)
    return out
  }, [watchRowMap, filtered])

  const total = sorted.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const cur = Math.min(page, pages)
  useEffect(() => { if (page > pages) setPage(pages) }, [page, pages])
  const slice = sorted.slice((cur - 1) * perPage, cur * perPage)
  const showWatch = watchRowMap !== null
  const visibleRows = showWatch && ordered ? ordered : slice

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'name' ? 'asc' : 'desc') }
  }

  const toggleTier = (t: ActivityTier) => setTiers((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]))
  const toggleRole = (id: string) => setRoleSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const clearInfluenceDrafts = () => { setInfDraft(''); setInfFrom(''); setInfTo('') }
  const clearFilters = () => { setTiers([]); setRoleSel([]); clearInfluenceDrafts(); setRcDraft(''); setRcOpOpen(false); setInfOpOpen(false); setSub(null) }

  // Role count / influence score accept non-negative whole numbers only;
  // digits are stripped on input so the derived values are always safe
  // integers. Influence clamps to its 0–100 range as you type; an emptied
  // input means the filter is off.
  const onRoleCountInput = (raw: string) => setRcDraft(raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))
  const stepRoleCount = (delta: number) => setRcDraft(String(Math.max(0, (rcDraft === '' ? 0 : parseInt(rcDraft, 10)) + delta)))
  const onInfInput = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    setInfDraft(digits === '' ? '' : String(clampInf(Number(digits))))
  }
  const stepInf = (delta: number) => setInfDraft(String(clampInf((infDraft === '' ? 0 : parseInt(infDraft, 10) || 0) + delta)))
  const onInfBound = (raw: string, set: (v: string) => void) => {
    const digits = raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '')
    set(digits === '' ? '' : String(clampInf(Number(digits))))
  }

  const allPageSel = visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.id))
  const somePageSel = visibleRows.some((r) => selected.has(r.id))
  const toggleAll = () => {
    setSelected((prev) => {
      const nx = new Set(prev)
      if (allPageSel) visibleRows.forEach((r) => nx.delete(r.id))
      else visibleRows.forEach((r) => nx.add(r.id))
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
      ...(influence ? { influence } : {}),
      ...(roleCount ? { roleCount: { ...roleCount } } : {}),
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

  const activeFilterCount = tiers.length + roleSel.length + (influence ? 1 : 0) + (roleCount ? 1 : 0)
  const rangeStart = total === 0 ? 0 : (cur - 1) * perPage + 1
  const rangeEnd = Math.min(total, cur * perPage)

  return selectedId ? (
    <MemberProfilePage memberId={selectedId} onBack={() => setSelectedId(null)} onExplore={onExploreMember ? () => onExploreMember(selectedId) : undefined} range={range} custom={custom} onSelectPreset={onSelectPreset} onSelectRange={onSelectRange} />
  ) : <>
    <section className="people-page">
      <div className="people-dock">
        <PageHeader collapsible headerClassName="header-no-lift" title="People" subtitle="Find and understand members of your community" action={
          <div className="ph-actions">
            <button className="people-export" type="button"><DownloadSimple size={20} />Export</button>
            {activeFilterCount > 0 && (
              <div className="seg-anchor" ref={smartRef}>
                <Button icon={<Lightning size={20} />} onClick={() => setSmartOpen((o) => !o)}>Create a smart segment</Button>
                {smartOpen && <div className="seg-scrim page" onMouseDown={() => setSmartOpen(false)} aria-hidden="true" />}
                {smartOpen && <div className="seg-dialog seg-pop" role="dialog" aria-label="Create a smart segment" aria-modal="true">
                  <button type="button" className="seg-dialog-close" aria-label="Close dialog" onClick={() => setSmartOpen(false)}><X size={16} /></button>
                  <h3 className="seg-dialog-title">Create a smart segment</h3>
                  <p className="seg-dialog-desc">A rule-based user group that updates as members act, join, or leave.</p>
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
        <div className="people-toolbar">
          <div className="people-search"><MagnifyingGlass size={16} /><input ref={searchRef} value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search by username" aria-label="Search by username" />{search !== '' && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setSearch(''); setPage(1); searchRef.current?.focus() }}><X size={16} /></button>}</div>
          <div className="people-select" ref={selRef}>
            <button type="button" onClick={() => setSelOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={selOpen}>
              <span className="ps-label"><span>{seg ? seg.name : 'Select segment'}</span></span><CaretDown size={16} />
            </button>
            {selOpen && <Menu>
              {segmentId !== 'all' && <MenuItem label="All members" selected={false} onSelect={() => { setSegmentId('all'); setSelOpen(false); setPage(1) }} />}
              {[...segs].sort((a, b) => segmentSize(b) - segmentSize(a)).map((s) => (
                <MenuItem key={s.id} label={s.name} selected={s.id === segmentId} leading={s.kind === 'dynamic' ? <Lightning size={16} /> : <Selection size={16} />} trailing={<span className="pp-count">{segmentSize(s)}</span>} onSelect={() => { setSegmentId(s.id); setSelOpen(false); setPage(1) }} />
              ))}
            </Menu>}
          </div>
          <div className="people-filter" ref={filterRef}>
            <button className="graph-filter-btn" type="button" aria-expanded={filterOpen} onClick={() => { setFilterOpen((o) => !o); setSub(null) }}><FunnelSimple size={16} />Filters{activeFilterCount > 0 && <span className="graph-filter-count">{activeFilterCount > 9 ? '9+' : activeFilterCount}</span>}</button>
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
              <div className="menu-sub-row" onMouseEnter={() => { setSub('rolecount'); setRcOpOpen(false) }}>
                <i className="menu-sub-icon"><ListNumbers size={16} /></i><span className="menu-label">Role Count</span><CaretRight size={14} className="caret" />
                {sub === 'rolecount' && <div className="menu menu-sub">
                  <div className="pp-rc-row">
                    <div className="pp-min-meta"><span>Show members with</span>{roleCount !== null && <button className="pp-min-clear" type="button" onClick={() => setRcDraft('')}>Reset</button>}</div>
                    <div className="pp-rc-op" ref={rcOpRef}>
                      <button type="button" className="pp-rc-op-btn" aria-haspopup="listbox" aria-expanded={rcOpOpen} onClick={() => setRcOpOpen((o) => !o)}>
                        <span>{rcOpLabel}</span><CaretDown size={14} />
                      </button>
                      {rcOpOpen && <Menu>
                        {COMPARE_OPS.map((o) => <MenuItem key={o.value} label={o.label} selected={o.value === rcOp} onSelect={() => { setRcOp(o.value); setRcOpOpen(false) }} />)}
                      </Menu>}
                    </div>
                    <div className="pp-stepper-wrap">
                      <div className="pp-stepper">
                        <button type="button" aria-label="Decrease role count" onClick={() => stepRoleCount(-1)}><Minus size={12} /></button>
                        <input value={rcDraft} aria-label="Role count" inputMode="numeric" placeholder="0" onChange={(e) => onRoleCountInput(e.target.value)} onFocus={(e) => e.target.select()} />
                        <button type="button" aria-label="Increase role count" onClick={() => stepRoleCount(1)}><Plus size={12} /></button>
                      </div>
                      <span className="pp-min-hint">{rcDraft === '1' ? 'role' : 'roles'}</span>
                    </div>
                  </div>
                </div>}
              </div>
              <div className="menu-sub-row" onMouseEnter={() => { setSub('influence'); setInfOpOpen(false) }}>
                <i className="menu-sub-icon"><Fire size={16} /></i><span className="menu-label">Influence score</span><CaretRight size={14} className="caret" />
                {sub === 'influence' && <div className="menu menu-sub">
                  <div className="pp-min-row">
                    <div className="pp-min-meta"><span>Show members with</span>{influence !== null && <button className="pp-min-clear" type="button" onClick={clearInfluenceDrafts}>Reset</button>}</div>
                    <div className="pp-rc-op" ref={infOpRef}>
                      <button type="button" className="pp-rc-op-btn" aria-haspopup="listbox" aria-expanded={infOpOpen} onClick={() => setInfOpOpen((o) => !o)}>
                        <span>{infOpLabel}</span><CaretDown size={14} />
                      </button>
                      {infOpOpen && <Menu>
                        {INF_OPS.map((o) => <MenuItem key={o.value} label={o.label} selected={o.value === infOp} onSelect={() => { setInfOp(o.value); setInfOpOpen(false) }} />)}
                      </Menu>}
                    </div>
                    <div className="pp-stepper-wrap">
                      {infOp !== 'custom'
                        ? <div className="pp-stepper">
                            <button type="button" aria-label="Decrease influence score" onClick={() => stepInf(-5)}><Minus size={12} /></button>
                            <input value={infDraft} aria-label="Influence score" inputMode="numeric" placeholder="0" onChange={(e) => onInfInput(e.target.value)} onFocus={(e) => e.target.select()} />
                            <button type="button" aria-label="Increase influence score" onClick={() => stepInf(5)}><Plus size={12} /></button>
                          </div>
                        : <div className="pp-inf-range">
                            <input value={infFrom} aria-label="Influence score range from" inputMode="numeric" placeholder="from" onChange={(e) => onInfBound(e.target.value, setInfFrom)} onFocus={(e) => e.target.select()} />
                            <input value={infTo} aria-label="Influence score range to" inputMode="numeric" placeholder="to" onChange={(e) => onInfBound(e.target.value, setInfTo)} onFocus={(e) => e.target.select()} />
                          </div>}
                      <span className="pp-min-hint">influence score number</span>
                    </div>
                  </div>
                </div>}
              </div>
              {activeFilterCount > 0 && <MenuItem label="Clear all filters" onSelect={clearFilters} />}
            </div>}
          </div>
        </div>

        {(tiers.length > 0 || roleSel.length > 0 || influence !== null || roleCount !== null) && <div className="people-pills">
          {tiers.map((t) => <span className={`filter-pill ${t.toLowerCase()}`} key={t}>{t}<button aria-label={`Clear ${t} filter`} onClick={() => toggleTier(t)}><X size={16} /></button></span>)}
          {roleSel.map((id) => { const r = roles.find((x) => x.id === id); return <span className="filter-pill" key={id}>{r && <i className="role-dot" style={{ background: r.color }} />}{r ? r.name : id}<button aria-label={`Clear ${id} filter`} onClick={() => toggleRole(id)}><X size={16} /></button></span> })}
          {influence && <span className="filter-pill"><Fire size={16} className="filter-pill-icon" />{'from' in influence ? `Influence: ${influence.from} – ${influence.to}` : `Influence: ${infOpLabel} ${influence.value}`}<button aria-label="Clear influence filter" onClick={clearInfluenceDrafts}><X size={16} /></button></span>}
          {roleCount && <span className="filter-pill">Role count: {rcOpLabel} {roleCount.value}<button aria-label="Clear role count filter" onClick={() => setRcDraft('')}><X size={16} /></button></span>}
          <Button variant="secondary" className="pp-clear-filters" onClick={clearFilters}>Clear filters</Button>
        </div>}
        {total > 0 && <div className={`people-shead${showWatch ? ' watch' : ''}`}>
            <div className="pt-cell pt-check"><button type="button" className={`pe-checkbox${somePageSel ? ' on' : ''}`} aria-label={allPageSel ? 'Deselect all on this page' : 'Select all on this page'} aria-pressed={allPageSel} onClick={toggleAll}>{somePageSel && <Check size={16} weight="bold" />}</button></div>
            <div className="pt-cell">{showWatch ? <span className="pt-sort-inactive">Member</span> : <SortBtn label="Member" active={sortKey === 'name'} dir={sortDir} onClick={() => onSort('name')} />}</div>
            {showWatch ? <div className="pt-cell"><span className="pt-sort-inactive">Change</span></div> : <div className="pt-cell"><span className="pt-sort-inactive">Activity level</span></div>}
            {showWatch ? <div className="pt-cell"><span className="pt-sort-inactive">Activity level</span></div> : <div className="pt-cell"><SortBtn label="Influence" active={sortKey === 'influence'} dir={sortDir} onClick={() => onSort('influence')} /></div>}
            {!showWatch && <div className="pt-cell"><span className="pt-sort-inactive">Roles</span></div>}
            {!showWatch && <div className="pt-cell"><SortBtn label="Joined" active={sortKey === 'joinedAt'} dir={sortDir} onClick={() => onSort('joinedAt')} /></div>}
            {!showWatch && <div className="pt-cell"><SortBtn label="Last activity" active={sortKey === 'lastActive'} dir={sortDir} onClick={() => onSort('lastActive')} /></div>}
            <div className="pt-cell"><span className="pt-sort-inactive">Activity graph</span></div>
        </div>}
      </div>

      {total === 0
        ? <div className="pt-empty"><span>No members match your filters.</span><button type="button" onClick={() => { setSearch(''); clearFilters(); setSegmentId('all') }}>Clear filters</button></div>
        : <div className="people-table-wrap">
            <div className={`people-table${showWatch ? ' watch' : ''}`}>
            {visibleRows.map((r) => {
              const picked = selected.has(r.id)
              const w = showWatch ? watchRowMap.get(r.id) : undefined
              const rest = r.roles.slice(1)
              const lastText = r.lastActiveAtMs === -Infinity ? '—' : (() => { const d = Math.floor((endMs - r.lastActiveAtMs) / DAY); return d <= 0 ? 'Today' : `${d}d ago` })()
              return <div className={`pt-row${picked ? ' selected' : ''}`} key={r.id}>
                <div className="pt-cell pt-check"><button type="button" className={`pe-checkbox${picked ? ' on' : ''}`} aria-label={`Select ${r.name}`} aria-pressed={picked} onClick={() => toggleRow(r.id)}>{picked && <Check size={16} weight="bold" />}</button></div>
                <div className="pt-cell"><div className="pt-member"><Avatar spec={getMemberAvatar(r.id)} name={r.name} size={32} /><span className="pt-names"><button type="button" className="pt-name" onClick={() => setSelectedId(r.id)}>{r.name}</button>{r.username && <span className="pt-username">@{r.username}</span>}</span></div></div>
                {showWatch && <div className="pt-cell">{w
                  ? <span className="watch-activity"><span className={`watch-dir ${w.direction}`}>{w.direction === 'up' ? <ArrowUp size={12} weight="bold" /> : <ArrowDown size={12} weight="bold" />}</span>{w.kind === 'tier' && w.from && w.to ? <span className="watch-change">Moved from <TierPill tier={w.from} /> to <TierPill tier={w.to} /></span> : <span className="watch-change">{w.text}</span>}</span>
                  : <span className="pt-sort-inactive">&mdash;</span>}</div>}
                <div className="pt-cell"><TierPill tier={r.tier} /></div>
                {!showWatch && <div className="pt-cell"><span className="pt-influence"><Fire size={16} /><b>{r.influence}</b></span></div>}
                {!showWatch && <div className="pt-cell"><div className="pt-roles">
                  {r.roles[0] ? <span className="role-pill"><i className="role-dot" style={{ background: r.roles[0].color }} />{r.roles[0].name}</span> : <span className="role-pill empty">&mdash;</span>}
                  {rest.length > 0 && <span className="role-pill more" tabIndex={0}>{`+${rest.length}`}<span className="tip" role="tooltip">{rest.map((n) => <span className="pp-role-label" key={n.id}><i className="role-dot" style={{ background: n.color }} />{n.name}</span>)}</span></span>}
                </div></div>}
                {!showWatch && <div className="pt-cell pt-num">{joinFmt.format(r.joinedAtMs)}</div>}
                {!showWatch && <div className="pt-cell pt-num">{lastText}</div>}
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