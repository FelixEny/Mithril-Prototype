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
  const watchRows = [0, 1, 2, 3, 4].map(i => <div className="sk-row" key={i}><span className="sk sk-avatar" /><div className="sk-cl"><Sk className="sk-name" /><div className="sk-bar-line"><Sk className="sk-bar-row" /><Sk className="sk-val" /></div></div></div>)
  const discus = [0, 1, 2, 3].map(i => <div className="sk-discus" key={i}><Sk className="sk-discus-tag" /><div className="sk-discus-mid"><Sk h={14} /><Sk h={12} /></div></div>)
  const peakRows = [0, 1, 2].map(i => <div className="sk-peak-row" key={i}><div className="sk-peak-l"><Sk w={88} h={12} /><Sk w={118} h={12} /></div><Sk w={52} h={12} /></div>)
  return <div aria-hidden="true">
    <div className="card metrics"><div className="card-title metrics-title"><Sk w={150} h={14} /></div><div className="metric-row">{[0, 1, 2, 3].map(k => <div className="metric sk-metric" key={k}><Sk /><Sk /></div>)}</div></div>
    <div className="card heat-card">
      <div className="heat-main"><div className="card-title"><Sk w={170} h={14} /><Sk w={180} h={36} /></div><div className="heat"><div className="y-labels">{[0, 1, 2, 3, 4, 5, 6].map(i => <Sk className="sk-y-bar" key={i} />)}</div><div className="cells">{cells}</div></div><div className="sk-footer"><div className="sk-swatch-row">{[0, 1, 2, 3, 4, 5, 6].map(i => <Sk className="sk-swatch" key={i} />)}<Sk w={62} h={12} /></div></div></div>
      <div className="peak-panel"><div className="peak-title"><Sk w={126} h={14} /></div>{peakRows}</div>
    </div>
    <div className="eng-grid">
      <div className="card"><div className="card-title"><Sk w={80} h={14} /><Sk w={110} h={14} /></div><div className="sk-chart-area"><div className="sk-bars">{barHeights.map((b, i) => <span className="sk sk-bar" key={i} style={{ height: b }} />)}</div><Sk className="sk-axis" /></div></div>
      <div className="card"><div className="card-title"><Sk w={150} h={14} /></div><div className="sk-chart-area"><div className="sk-bars">{barHeights.map((b, i) => <span className="sk sk-bar" key={i} style={{ height: b }} />)}</div><Sk className="sk-axis" /></div></div>
    </div>
    <div className="eng-grid">
      <div className="card"><div className="sk-eng-head"><Sk w={34} h={12} /><Sk w={120} h={12} /><Sk w={100} h={12} /><Sk w={70} h={12} /></div>{rows}</div>
      <div className="card"><div className="sk-eng-head"><Sk w={90} h={12} /><Sk w={110} h={12} /></div>{watchRows}</div>
    </div>
    <div className="card trend-card"><div className="card-title"><Sk w={160} h={14} /></div><div className="sk-eng-head"><Sk w={100} h={12} /><Sk w={140} h={12} /></div>{discus}</div>
  </div>
}