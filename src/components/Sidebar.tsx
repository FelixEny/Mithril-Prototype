import { BookOpen, CaretUpDown, ChartBar, Crown, Gear, Graph, Headset, SidebarSimple, SquaresFour, Users } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import MithrilIcon from '../assets/mithril-icon.svg'
import designersLogo from '../assets/designers-dao-logo.png'
import { OrgMenu } from './OrgMenu'
import { SwitchWorkspace } from './SwitchWorkspace'
import { workspaces, type Workspace } from '../data'

export type PageKey = 'Overview' | 'Engagement' | 'Relationships' | 'People'

const items: [PageKey, React.ComponentType<{ size?: number; weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill' | 'duotone'; color?: string }>][] = [
  ['Overview', SquaresFour],
  ['Engagement', ChartBar],
  ['Relationships', Graph],
  ['People', Users],
]

export function Sidebar({ active, onNavigate }: { active: PageKey; onNavigate: (page: PageKey) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [switchOpen, setSwitchOpen] = useState(false)
  const activeWs = workspaces.find((w) => w.active) || workspaces[0]
  const [activeId, setActiveId] = useState(activeWs?.id)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen && !switchOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        setSwitchOpen(false)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && e.target instanceof Node && !wrapRef.current.contains(e.target)) {
        setMenuOpen(false)
        setSwitchOpen(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menuOpen, switchOpen])

  const ws = workspaces.find((w) => w.id === activeId) || activeWs

  return (
    <aside>
      <div className="community-wrap" ref={wrapRef}>
        <div className="community-switch">
          <button
            className="community-switch-inner"
            type="button"
            onClick={() => {
              if (!ws) return
              setMenuOpen((v) => !v)
              setSwitchOpen(false)
            }}
          >
            <div className="community-info">
              {ws ? <img className="community-avatar" src={ws.logo} alt={ws.name} /> : <img className="community-avatar" src={designersLogo} alt="Designers Dao" />}
              <span>{ws?.name ?? 'Designers Dao'}</span>
            </div>
            <CaretUpDown size={16} />
          </button>
        </div>

        {menuOpen && ws && (
          <OrgMenu
            workspace={ws}
            onOpenSwitch={() => setSwitchOpen(true)}
            onClose={() => {
              setMenuOpen(false)
              setSwitchOpen(false)
            }}
          />
        )}

        {switchOpen && (
          <SwitchWorkspace
            workspaces={workspaces}
            activeId={activeId}
            onSelect={(w: Workspace) => {
              setActiveId(w.id)
              // mark workspaces' active state conceptually; in this prototype, we just track activeId
              workspaces.forEach((x) => (x.active = x.id === w.id))
            }}
            onClose={() => {
              setMenuOpen(false)
              setSwitchOpen(false)
            }}
          />
        )}
      </div>

      <nav>
        {items.map(([label, Icon]) => {
          const isActive = label === active
          return (
            <button className={isActive ? 'active' : ''} key={label} onClick={() => onNavigate(label)}>
              <Icon size={20} />
              {label}
            </button>
          )
        })}
      </nav>

      <div className="side-bottom">
        <div className="bottom-icons">
          <button type="button"><Gear size={20} />Settings</button>
          <button type="button"><BookOpen size={20} />Docs</button>
          <button type="button"><Headset size={20} />Support</button>
        </div>
        <div className="trial">
          <div className="trial-card">
            <small>Trial ends in 10 days</small>
            <button className="upgrade" type="button"><Crown size={20} />Upgrade to Pro</button>
          </div>
        </div>
        <hr />
        <div className="logo-row">
          <div className="logo-inner">
            <div className="brand">
              <img src={MithrilIcon} alt="" /><span className="brand-name">Mithril</span>
            </div>
            <SidebarSimple size={20} color="var(--content-tertiary)" />
          </div>
        </div>
      </div>
    </aside>
  )
}
