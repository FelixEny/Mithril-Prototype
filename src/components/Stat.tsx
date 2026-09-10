import { Change } from './Change'
import { Label } from './Label'

export function Stat({ label, info, value, change, layout = 'side', footer }: { label: string; info?: string; value: string; change: { v: number; pp?: boolean; range: number; caption?: string }; layout?: 'side' | 'below'; footer?: React.ReactNode }) {
  const changeEl = <Change v={change.v} pp={change.pp} range={change.range} caption={change.caption}/>
  return <div className={`stat${layout === 'below' ? ' below' : ''}`}><Label text={label} info={info}/>{layout === 'below' ? <div className="stat-value-row"><h2>{value}</h2>{changeEl}</div> : <div className="stat-row"><h2>{value}</h2>{changeEl}</div>}{footer && <p className="stat-info">{footer}</p>}</div>
}