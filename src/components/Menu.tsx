

export function Menu({ children, className = '', role = 'listbox' }: { children: React.ReactNode; className?: string; role?: string }) {
  return <div role={role} className={`menu${className ? ' ' + className : ''}`}>{children}</div>
}

export function MenuGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  return <div className="menu-group">{title && <div className="menu-group-title">{title}</div>}{children}</div>
}

export function MenuItem({ label, selected = false, leading, trailing, onSelect, className = '', onMouseEnter, onMouseLeave }: {
  label: React.ReactNode
  selected?: boolean
  leading?: React.ReactNode
  trailing?: React.ReactNode
  onSelect?: () => void
  className?: string
  onMouseEnter?: (e: React.MouseEvent) => void
  onMouseLeave?: (e: React.MouseEvent) => void
}) {
  return <button type="button" role="option" aria-selected={selected} className={`menu-item${selected ? ' selected' : ''}${className ? ' ' + className : ''}`} onClick={onSelect} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
    {leading && <span className="menu-icon">{leading}</span>}
    <span className="menu-label">{label}</span>
    {trailing && <span className="menu-trailing">{trailing}</span>}
  </button>
}