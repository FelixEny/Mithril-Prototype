import { useEffect, useRef, useState } from 'react'
import { CaretDown, SquaresFour, X } from '@phosphor-icons/react'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Menu, MenuItem } from './Menu'
import { getMemberAvatar } from '../avatars'
import type { Segment } from '../data'
import type { PeopleRow } from '../people'

export function SegmentActionsBar({ selected, members, removeTarget, segments, onCreate, onAdd, onRemove, onClose }: {
  selected: Set<string>
  members: PeopleRow[]
  removeTarget: Segment | null
  segments: Segment[]
  onCreate: (name: string) => void
  onAdd: (segmentId: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [open, setOpen] = useState<null | 'create' | 'add' | 'remove'>(null)
  const [name, setName] = useState('')
  const [addId, setAddId] = useState<string | null>(segments[0]?.id ?? null)
  const [addOpen, setAddOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [open])
  useEffect(() => { if (open === 'create') nameRef.current?.focus() }, [open])
  useEffect(() => {
    setAddId((prev) => (prev && segments.some((s) => s.id === prev) ? prev : segments[0]?.id ?? null))
  }, [segments])

  const close = () => { setOpen(null); setAddOpen(false) }
  const commitCreate = () => { onCreate(name.trim() || 'Selected members'); setName(''); close() }
  const commitAdd = () => { if (addId) onAdd(addId); close() }
  const commitRemove = () => { onRemove(); close() }

  const extra = members.slice(0, 2)
  const more = members.length - extra.length

  return (
    <div className="seg-fixed" ref={rootRef}>
      {open && <div className="seg-scrim" onMouseDown={close} aria-hidden="true" />}
      {open === 'create' && <div className="seg-dialog" role="dialog" aria-label="Create a static segment">
        <button type="button" className="seg-dialog-close" aria-label="Close dialog" onClick={close}><X size={16} /></button>
        <h3 className="seg-dialog-title">Create a static segment</h3>
        <p className="seg-dialog-desc">A manually defined user group that stays fixed until updated.</p>
        <div className="seg-dialog-body">
          <input ref={nameRef} className="seg-input" value={name} placeholder="Segment name" aria-label="Segment name" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitCreate() }} />
        </div>
        <div className="seg-dialog-actions">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button onClick={commitCreate}>Create segment</Button>
        </div>
      </div>}

      {open === 'add' && <div className="seg-dialog" role="dialog" aria-label="Add to segment">
        <button type="button" className="seg-dialog-close" aria-label="Close dialog" onClick={close}><X size={16} /></button>
        <h3 className="seg-dialog-title">Add to segment</h3>
        <p className="seg-dialog-desc">Select an existing segment to add the selected members to.</p>
        <div className="seg-dialog-body">
          {segments.length === 0
            ? <p className="seg-hint">No editable segments yet. Create one to add members.</p>
            : <div className="seg-select">
                <button type="button" className="seg-select-btn" onClick={() => setAddOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={addOpen}>
                  <span>{segments.find((s) => s.id === addId)?.name ?? 'Select segment'}</span><CaretDown size={16} />
                </button>
                {addOpen && <Menu>{segments.map((s) => <MenuItem key={s.id} label={s.name} selected={s.id === addId} onSelect={() => { setAddId(s.id); setAddOpen(false) }} />)}</Menu>}
              </div>}
        </div>
        <div className="seg-dialog-actions">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button disabled={!addId} onClick={commitAdd}>Add</Button>
        </div>
      </div>}

      {open === 'remove' && <div className="seg-dialog" role="dialog" aria-label="Confirm request">
        <button type="button" className="seg-dialog-close" aria-label="Close dialog" onClick={close}><X size={16} /></button>
        <h3 className="seg-dialog-title">Confirm request</h3>
        <p className="seg-dialog-desc">Remove selected person(s) from this segment?</p>
        <div className="seg-dialog-actions">
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" onClick={commitRemove}>Remove</Button>
        </div>
      </div>}

      <div className="seg-bar">
        <div className="seg-group">
          <span className="seg-stack">
            {extra.map((m) => <Avatar key={m.id} spec={getMemberAvatar(m.id)} name={m.name} size={32} />)}
            {more > 0 && <span className="seg-more">+{more}</span>}
          </span>
          <span className="seg-bar-text">{selected.size} {selected.size === 1 ? 'person' : 'people'} selected</span>
        </div>
        <div className="seg-group seg-actions">
          <Button variant="secondary" onClick={() => setOpen(removeTarget ? 'remove' : 'add')}>{removeTarget ? 'Remove from segment' : 'Add to segment'}</Button>
          <Button icon={<SquaresFour size={20} />} onClick={() => setOpen('create')}>Create a static segment</Button>
          <button type="button" className="seg-close" aria-label="Close and clear selection" onClick={onClose}><X size={16} /></button>
        </div>
      </div>
    </div>
  )
}