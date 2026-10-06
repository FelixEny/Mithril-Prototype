import type { ReactElement } from 'react'
import { Sk } from './Skeleton'

const barHeights = [22, 34, 28, 46, 62, 38, 74, 56, 48, 70, 42, 60]
const cellOpacity = (wd: number, h: number) => {
  const night = h < 7 || h >= 23 ? 0.16 : 0
  const morning = h >= 7 && h <= 11 ? 0.5 : 0
  const evening = h >= 12 && h <= 22 ? 0.72 : 0
  const weekend = wd >= 5 && h >= 10 && h <= 18 ? 0.32 : 0
  return Math.min(0.95, night + morning + evening + weekend)
}
const cells: ReactElement[] = []
for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) cells.push(<Sk className="sk-cell" key={`${wd}-${h}`} style={{ opacity: cellOpacity(wd, h) }} />)

export default function DashboardSkeleton() {
  const rows = [0, 1, 2, 3, 4].map(i => <div className="sk-row" key={i}><Sk className="sk-rank" /><div className="sk-cl"><Sk className="sk-name" /><div className="sk-bar-line"><Sk className="sk-bar-row" /><Sk className="sk-val" /></div></div></div>)
  const discus = [0, 1, 2, 3].map(i => <div className="sk-discus" key={i}><Sk className="sk-discus-tag" /><div className="sk-discus-mid"><Sk h={14} /><Sk h={12} /></div></div>)
  return <div aria-hidden="true">
    <div className="card metrics"><div className="card-title metrics-title"><Sk w={150} h={14} /></div><div className="metric-row">{[0, 1, 2, 3].map(k => <div className="metric sk-metric" key={k}><Sk /><Sk /></div>)}</div><div className="metrics-insight"><div className="insight"><Sk className="sk-insight" /></div></div></div>
    <div className="two-grid">
      <div className="card"><div className="card-title"><Sk w={180} h={14} /><Sk w={180} h={36} /></div><div className="sk-chart-area"><div className="sk-bars">{barHeights.map((b, i) => <span className="sk sk-bar" key={i} style={{ height: b }} />)}</div><Sk className="sk-axis" /></div></div>
      <div className="card"><div className="card-title"><Sk w={190} h={14} /></div><div className="sk-donut-wrap"><span className="sk sk-donut" /><div className="sk-legend"><div className="sk-legend-col">{[0, 1, 2, 3, 4].map(i => <Sk key={i} />)}</div></div></div></div>
    </div>
    <div className="card heat-card"><div className="card-title"><Sk w={170} h={14} /><Sk w={180} h={36} /></div><div className="heat"><div className="y-labels">{[0, 1, 2, 3, 4, 5, 6].map(i => <Sk className="sk-y-bar" key={i} />)}</div><div className="cells">{cells}</div></div><div className="sk-footer"><div className="sk-swatch-row">{[0, 1, 2, 3, 4, 5, 6].map(i => <Sk className="sk-swatch" key={i} />)}<Sk w={58} h={12} /></div><Sk w={110} h={14} /></div></div>
    <div className="bottom-grid">
      <div className="card"><div className="sk-table-head"><Sk /><Sk /></div>{rows}</div>
      <div className="card"><div className="sk-table-head"><Sk w={130} h={12} /><Sk w={70} h={12} /></div>{discus}</div>
    </div>
  </div>
}