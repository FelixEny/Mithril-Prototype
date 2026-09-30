

import { Check } from '@phosphor-icons/react'


export function Menu({ children, className = '', role = 'listbox' }: { children: React.ReactNode; className?: string; role?: string }) {
  return <div role={role} className={`menu${className ? ' ' + className : ''}`}>{children}</div>
}

export function MenuGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return <div className="menu-group">{title && <div className="menu-group-title">{title}</div>}{children}</div>
}

export function MenuItem({ label, selected = false, leading, trailing, onSelect, className = '', onMouseEnter, onMouseLeave, disabled = false }: {
  label: React.ReactNode
  selected?: boolean
  leading?: React.ReactNode
  trailing?: React.ReactNode
  onSelect?: () => void
  className?: string
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
  disabled?: boolean
}) {
  return <button type="button" role="option" aria-selected={selected} disabled={disabled} className={`menu-item${selected ? ' selected' : ''}${className ? ' ' + className : ''}`} onClick={onSelect} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    {leading && <span className="menu-icon">{leading}</span>}
    <span className="menu-label">{label}</span>
    {trailing && <span className="menu-trailing">{trailing}</span>}
  </button>
}

// Multi-select menu option rendered with a checkbox before the label (used by
// the People page filters). The checkbox is always in the DOM so item labels
// stay aligned across checked/unchecked states.
export function MenuCheckItem({ label, checked = false, onToggle, className = '', disabled = false }: {
  label: React.ReactNode
  checked?: boolean
  onToggle?: () => void
  className?: string
  disabled?: boolean
}) {
  return <button type="button" role="option" aria-selected={checked} disabled={disabled} className={`menu-item menu-check-item${checked ? ' selected' : ''}${className ? ' ' + className : ''}`} onClick={onToggle}>
    <span className={`menu-checkbox${checked ? ' on' : ''}`} aria-hidden="true">{checked && <Check size={12} weight="bold" />}</span>
    <span className="menu-label">{label}</span>
  </button>
}