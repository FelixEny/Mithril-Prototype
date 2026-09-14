import { BookOpen, CaretUpDown, ChartBar, Gear, Graph, Headset, House, Lightning, SidebarSimple, Users } from '@phosphor-icons/react'
import MithrilIcon from '../assets/mithril-icon.svg'
import MithrilWordmark from '../assets/mithril-wordmark.svg'

export type PageKey = 'Overview' | 'Engagement' | 'Relationships' | 'People'

const items: [PageKey, React.ComponentType<{ size?: number }>][] = [['Overview', House], ['Engagement', ChartBar], ['Relationships', Graph], ['People', Users]]

export function Sidebar({ active, onNavigate }: { active: PageKey; onNavigate: (page: PageKey) => void }) {
  return <aside><div className="community-switch"><div className="community-switch-inner"><div className="community-info"><div className="community-avatar">G</div><span>Gitcoin</span></div><CaretUpDown size={16} /></div></div><nav>{items.map(([label, Icon]) => <button className={label === active ? 'active' : ''} key={label} onClick={() => onNavigate(label)}><Icon size={20} />{label}</button>)}</nav><div className="side-bottom"><div className="bottom-icons"><button><Gear size={20} />Settings</button><button><BookOpen size={20} />Docs</button><button><Headset size={20} />Support</button></div><div className="trial"><div className="trial-card"><small>Trial ends in 10 days</small><button className="upgrade"><Lightning weight="fill" size={20} />Upgrade to Pro</button></div></div><hr /><div className="logo-row"><div className="logo-inner"><div className="brand"><img src={MithrilIcon} alt="" /><img src={MithrilWordmark} alt="Mithril" /></div><SidebarSimple size={20} color="var(--content-tertiary)" /></div></div></div></aside>
}
