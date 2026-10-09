import { Card } from './Card'
import { CardTitle } from './CardTitle'
import { Stat } from './Stat'
import { TextLink } from './TextLink'

export interface MetricsCardStat {
  label: string
  info?: string
  value: React.ReactNode
  change?: { v: number; pp?: boolean; range: number; caption?: string; invert?: boolean }
}

export function MetricsCard({ title, link, href, onClick, stats, className = '' }: { title: string; link?: string; href?: string; onClick?: () => void; stats: MetricsCardStat[]; className?: string }) {
  const action = link ? (href ? <TextLink href={href}>{link}</TextLink> : <TextLink onClick={onClick}>{link}</TextLink>) : undefined
  return (
    <Card className={`metrics${className ? ' ' + className : ''}`}>
      <CardTitle title={title} className="metrics-title" action={action} />
      <div className="metric-row">
        {stats.map((s, i) => <div className="metric" key={i}><Stat label={s.label} info={s.info} value={s.value} change={s.change}/></div>)}
      </div>
    </Card>
  )
}