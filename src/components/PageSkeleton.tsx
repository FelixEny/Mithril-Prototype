import { Sk } from './Skeleton'
import MithrilIcon from '../assets/mithril-icon.svg'
import type { PageKey } from './Sidebar'

// Per-page loading skeletons that mirror each page's real markup: same class
// names, same nesting, same controls — so every skeleton block measures the
// block it stands in for and the page does not reflow when data arrives.
//
// Text is drawn as pulsating bars. `Tx` wraps a bar in a span so the line box
// keeps the surrounding line-height (strut) instead of collapsing to the bar's
// own height; `TxLines` draws a wrapped paragraph as N stacked line boxes.
// Every bar keeps h at or below its strut, so the wrapper never grows the line.

const Tx = ({ w, h = 14 }: { w: number; h?: number }) => <span><Sk w={w} h={h} /></span>

const TxLines = ({ widths, h = 14 }: { widths: number[]; h?: number }) => (
  <span>{widths.map((w, i) => <span key={i}>{i > 0 && <br />}<Sk w={w} h={h} /></span>)}</span>
)

// Same shape as the real heat grid's activity ramp (the cells carry the load
// opacity, exactly like Dashboard's old skeleton did).
const cellOpacity = (wd: number, h: number) => {
  const night = h < 7 || h >= 23 ? 0.16 : 0
  const morning = h >= 7 && h <= 11 ? 0.5 : 0
  const evening = h >= 12 && h <= 22 ? 0.72 : 0
  const weekend = wd >= 5 && h >= 10 && h <= 18 ? 0.32 : 0
  return Math.min(0.95, night + morning + evening + weekend)
}
const heatCells = (() => {
  const cells: { wd: number; h: number }[] = []
  for (let wd = 0; wd < 7; wd++) for (let h = 0; h < 24; h++) cells.push({ wd, h })
  return cells
})()

const chartBars = [22, 34, 28, 46, 62, 38, 74, 56, 48, 70, 42, 60]

// --- shared blocks -------------------------------------------------------

function SkHeader({ cls, titleCls, titleW, titleH = 24, subW, action }: { cls?: string; titleCls?: string; titleW: number; titleH?: number; subW?: number; action?: React.ReactNode }) {
  return <header className={cls}>
    <div className={titleCls ? `page-title ${titleCls}` : 'page-title'}><h1><Tx w={titleW} h={titleH} /></h1>{subW && <p><Tx w={subW} h={14} /></p>}</div>
    {action}
  </header>
}

function SkDateControl() {
  return <div className="date-control"><Sk w={16} h={16} /><span className="dc-label"><Tx w={81} h={14} /></span><span className="dc-value"><Tx w={90} h={14} /></span></div>
}

function SkTitle({ titleW, metaW, info = false, action, cls = '' }: { titleW: number; metaW?: number; info?: boolean; action?: React.ReactNode; cls?: string }) {
  return <div className={`card-title${action ? '' : ' card-title-no-action'}${cls ? ' ' + cls : ''}`}>
    <h3><Tx w={titleW} h={14} /></h3>
    {info && <span className="card-title-info info-tip" tabIndex={-1}><Sk w={16} h={16} /></span>}
    {action ? <div className="card-title-action">{action}</div> : metaW ? <span className="card-title-meta"><Tx w={metaW} h={10} /></span> : null}
  </div>
}

function SkLink({ w }: { w: number }) {
  return <button type="button" className="chart-link" tabIndex={-1}><Tx w={w} h={14} /><Sk w={16} h={16} /></button>
}

function SkChange({ w = 44, em = 58, tone = 'positive' }: { w?: number; em?: number; tone?: 'positive' | 'negative' }) {
  return <span className={`metric-change ${tone}`}><b><Tx w={w} h={12} /></b><em><Tx w={em} h={12} /></em></span>
}

function SkMetrics({ titleW, action, info, labels, values, noLastChange = false }: {
  titleW: number
  action?: React.ReactNode
  info?: 'last' | 'all'
  labels: number[]
  values: number[]
  noLastChange?: boolean
}) {
  const tones = ['positive', 'positive', 'negative', 'positive'] as const
  return <div className="card metrics">
    <SkTitle cls="metrics-title" titleW={titleW} action={action} />
    <div className="metric-row">
      {labels.map((lw, i) => <div className="metric" key={i}>
        <div className="stat">
          <span className="stat-title"><Tx w={lw} h={14} />{info === 'all' || (info === 'last' && i === 3) ? <span className="info-tip" tabIndex={-1}><Sk w={16} h={16} /></span> : null}</span>
          <div className="stat-row"><h2><Tx w={values[i]} h={21} /></h2>{noLastChange && i === 3 ? null : <SkChange tone={tones[i]} />}</div>
        </div>
      </div>)}
    </div>
  </div>
}

function SkChart() {
  return <div className="sk-chart-area">
    <div className="sk-bars">{chartBars.map((b, i) => <span className="sk sk-bar" key={i} style={{ height: b }} />)}</div>
    <Sk className="sk-axis" />
  </div>
}

// --- Overview ------------------------------------------------------------

function SkInsight({ tone, chipW, titleLines, detailLines, recLines, linkW }: { tone: string; chipW: number; titleLines: number[]; detailLines: number[]; recLines: number[]; linkW: number }) {
  return <div className="insight-col">
    <span className={`insight-chip ${tone}`}><Tx w={chipW} h={10} /></span>
    <div className="insight-text">
      <p className="insight-title"><TxLines widths={titleLines} h={14} /></p>
      <p className="insight-detail"><TxLines widths={detailLines} h={14} /></p>
    </div>
    <div className="insight-block">
      <p className="insight-recommend"><Sk w={16} h={16} /><TxLines widths={recLines} h={10} /></p>
    </div>
    <SkLink w={linkW} />
  </div>
}

const INSIGHTS = [
  { tone: 'attention', chipW: 96, titleLines: [190, 150], detailLines: [194, 190, 120], recLines: [158, 156, 158, 152, 90], linkW: 128 },
  { tone: 'positive', chipW: 52, titleLines: [186, 140], detailLines: [190, 194, 110], recLines: [156, 158, 154, 158, 74], linkW: 128 },
  { tone: 'opportunity', chipW: 74, titleLines: [190, 148], detailLines: [194, 190, 110], recLines: [158, 154, 158, 156, 152, 60], linkW: 128 },
  { tone: 'notable', chipW: 52, titleLines: [196, 150], detailLines: [194, 190, 176, 70], recLines: [156, 158, 154, 88], linkW: 122 },
]

const LEGEND_LABEL_W = [49, 49, 40, 71, 65]
const LEGEND_PCT_W = [28, 28, 28, 20, 20]
const LEGEND_COUNT_W = [43, 32, 32, 32, 24]

const FEED_HEADLINE_W = [298, 246, 322, 214]
const FEED_DETAIL_W = [250, 286, 214, 268]

function SkFeed() {
  return <div className="feed">
    {[0, 1, 2, 3].map((i) => <div className="feed-row" key={i}>
      <span className="feed-icon"><Sk w={20} h={20} /></span>
      <div className="feed-body">
        <p className="feed-headline"><Tx w={FEED_HEADLINE_W[i]} h={14} /></p>
        <p className="feed-supporting">
          <span className="feed-avatars avatar-stack"><span className="avatar-slot"><Sk className="sk-round" w={20} h={20} /></span></span>
          <span className="feed-detail"><Tx w={FEED_DETAIL_W[i]} h={14} /></span>
          <span className="feed-time"><Tx w={44} h={12} /></span>
        </p>
      </div>
    </div>)}
  </div>
}

function OverviewSkeleton() {
  return <>
    <SkHeader cls="header-greeting" titleCls="greeting-title" titleW={235} titleH={21} />
    <p className="lead-story"><TxLines widths={[500, 505]} h={36} /></p>
    <SkMetrics titleW={160} action={<SkLink w={47} />} info="last" labels={[96, 92, 84, 130]} values={[64, 56, 48, 64]} />
    <div className="card insights-card">
      <SkTitle cls="metrics-title" titleW={176} metaW={98} />
      <div className="insights-panel"><div className="insights-grid">
        {INSIGHTS.map((c, i) => <SkInsight key={i} {...c} />)}
      </div></div>
    </div>
    <div className="card strength-card">
      <SkTitle cls="metrics-title" titleW={160} metaW={98} />
      <div className="strength-body">
        <div className="strength-gauge">
          <div className="gauge">
            <span className="sk sk-gauge" />
            <div className="gauge-center">
              <span className="gauge-score"><b><Tx w={40} h={28} /></b><span><Tx w={26} h={14} /></span></span>
              <span className="gauge-caption"><Tx w={92} h={12} /></span>
              <SkChange w={36} em={54} />
            </div>
          </div>
        </div>
        <div className="strength-rows">
          {[88, 72, 64, 51].map((pct, i) => <div className="strength-row" key={i}>
            <div className="strength-row-info">
              <div className="strength-row-title"><span className="stat-title"><Tx w={92} h={14} /></span><span className="strength-weight"><Tx w={64} h={12} /></span></div>
            </div>
            <div className="strength-bar"><i style={{ width: `${pct}%`, background: 'var(--surface-tertiary)' }} /></div>
            <div className="strength-row-score"><b><Tx w={20} h={16} /></b><span><Tx w={26} h={12} /></span></div>
          </div>)}
        </div>
      </div>
    </div>
    <div className="bottom-grid">
      <div className="card">
        <SkTitle titleW={200} metaW={98} />
        <div className="participation">
          <div className="donut">
            <span className="sk sk-donut" />
            <div className="total"><b><Tx w={63} h={24} /></b><span><Tx w={56} h={14} /></span></div>
          </div>
          <div className="legend">
            {LEGEND_LABEL_W.map((lw, i) => <div className="legend-item" key={i}>
              <span className="label"><i className="sk" /><span><Tx w={lw} h={14} /></span></span>
              <span className="count"><b><Tx w={LEGEND_PCT_W[i]} h={14} /></b><em><Tx w={LEGEND_COUNT_W[i]} h={14} /></em></span>
            </div>)}
          </div>
        </div>
      </div>
      <div className="card">
        <SkTitle titleW={110} metaW={98} />
        <SkFeed />
      </div>
    </div>
  </>
}

// --- Engagement ----------------------------------------------------------

const HEAT_HOURS = Array.from({ length: 12 }, (_, i) => i)
const PEAKS = [
  { day: 78, window: 96, avg: [118, 96], trend: 34 },
  { day: 64, window: 110, avg: [124, 76], trend: 28 },
  { day: 86, window: 84, avg: [112, 104], trend: 38 },
]

const CHAN_ROWS = [
  { name: 84, count: 56, msgs: 64 },
  { name: 66, count: 48, msgs: 58 },
  { name: 102, count: 52, msgs: 60 },
  { name: 74, count: 46, msgs: 54 },
  { name: 90, count: 50, msgs: 62 },
]

const WATCH_ROWS = [
  { name: 92, handle: 64, change: 96 },
  { name: 78, handle: 58, change: 74 },
  { name: 106, handle: 70, change: 88 },
  { name: 84, handle: 54, change: 104 },
  { name: 70, handle: 66, change: 68 },
]

const TOP_ROWS = [
  { name: 92, handle: 64 },
  { name: 78, handle: 58 },
  { name: 106, handle: 70 },
  { name: 84, handle: 54 },
  { name: 70, handle: 66 },
]

const DISCUSSIONS = [
  { name: 66, text: 246 },
  { name: 74, text: 218 },
  { name: 58, text: 262 },
  { name: 82, text: 234 },
]

function EngagementSkeleton() {
  return <>
    <SkHeader cls="sticky-compact" titleW={140} subW={340} action={<SkDateControl />} />
    <SkMetrics titleW={145} action={<SkLink w={67} />} info="all" labels={[72, 74, 120, 108]} values={[72, 56, 56, 72]} />
    <div className="card heat-card">
      <div className="heat-main">
        <SkTitle titleW={210} />
        <div className="heat">
          <div className="y-labels">{[0, 1, 2, 3, 4, 5, 6].map((i) => <span key={i}><Tx w={26} h={12} /></span>)}</div>
          <div className="cells">
            {heatCells.map((c) => <Sk className="sk-cell" key={`${c.wd}-${c.h}`} style={{ opacity: cellOpacity(c.wd, c.h) }} />)}
            <div className="hours">{HEAT_HOURS.map((i) => <span key={i}><Sk w={22} h={10} /></span>)}</div>
          </div>
        </div>
        <div className="heat-footer"><div className="activity-legend"><span><Tx w={67} h={10} /></span><span className="heat-scale">{[1, 2, 3, 4, 5, 6, 7].map((n) => <i key={n} />)}</span><span><Tx w={69} h={10} /></span></div></div>
      </div>
      <div className="peak-panel">
        <div className="peak-title"><h3><Tx w={126} h={14} /></h3></div>
        <div className="peak-rows">
          {PEAKS.map((p, i) => <div className="peak-row" key={i}>
            <div className="peak-info">
              <span className="peak-day"><Tx w={p.day} h={14} /></span>
              <span className="peak-window"><Tx w={p.window} h={10} /></span>
              <span className="peak-avg"><TxLines widths={p.avg} h={10} /></span>
            </div>
            <div className="peak-scaler">
              <span className="peak-trend"><Sk w={16} h={16} /><Tx w={p.trend} h={10} /></span>
              <span className="peak-caption"><Tx w={56} h={6} /></span>
            </div>
          </div>)}
        </div>
      </div>
    </div>
    <div className="eng-grid">
      <div className="card">
        <SkTitle titleW={80} info action={<SkLink w={74} />} />
        <div className="chart-stat"><h2><Tx w={48} h={21} /></h2><SkChange em={60} /></div>
        <div className="chart-box"><div className="chart eng-chart"><SkChart /></div></div>
        <div className="ret-legend">{[67, 83, 64, 69].map((w, i) => <span className="ret-legend-item" key={i}><i className="sk" /><Tx w={w} h={10} /></span>)}</div>
      </div>
      <div className="card">
        <SkTitle titleW={150} info />
        <div className="chart-stat"><h2><Tx w={44} h={21} /></h2><SkChange em={58} /></div>
        <div className="chart-box act-chart-box"><div className="chart eng-chart"><SkChart /></div></div>
      </div>
    </div>
    <div className="eng-grid">
      <div className="card">
        <SkTitle titleW={140} />
        <div className="chan-head"><span className="chan-rank"><Tx w={10} h={10} /></span><span><Tx w={56} h={10} /></span><span><Tx w={70} h={10} /></span><span><Tx w={76} h={10} /></span><span><Tx w={52} h={10} /></span></div>
        {CHAN_ROWS.map((r, i) => <div className="chan-row" key={i}>
          <span className="chan-rank"><Tx w={8} h={14} /></span>
          <span className="tag"><Sk w={20} h={20} /><Tx w={r.name} h={14} /></span>
          <span className="chan-count"><Tx w={r.count} h={14} /></span>
          <span className="chan-count"><Tx w={r.msgs} h={14} /></span>
          <span className={`chan-change ${i === 1 ? 'down' : i === 3 ? 'neutral' : 'up'}`}><Sk w={12} h={12} /><Tx w={i === 3 ? 10 : 32} h={14} /></span>
        </div>)}
      </div>
      <div className="card trend-card">
        <SkTitle titleW={160} />
        <div className="discussion-head"><span><Tx w={58} h={10} /></span><span><Tx w={88} h={10} /></span></div>
        {DISCUSSIONS.map((d, i) => <div className="discussion" key={i}>
          <span className="tag"><Sk w={20} h={20} /><Tx w={d.name} h={14} /></span>
          <div>
            <p><Tx w={d.text} h={14} /></p>
            <div className="discussion-meta">
              <span className="meta-avatars"><span className="avatar-stack"><span className="avatar-slot"><Sk className="sk-round" w={20} h={20} /></span><span className="avatar-slot"><Sk className="sk-round" w={20} h={20} /></span></span></span>
              <span className="stat"><b><Tx w={10} h={12} /></b><Tx w={40} h={12} /></span>
              <span className="stat"><b><Tx w={10} h={12} /></b><Tx w={62} h={12} /></span>
              <strong><Sk w={12} h={12} /><small><Tx w={70} h={12} /></small></strong>
            </div>
          </div>
        </div>)}
      </div>
    </div>
    <div className="eng-grid">
      <div className="card">
        <SkTitle titleW={150} />
        <div className="top-head"><span className="chan-rank"><Tx w={10} h={10} /></span><span><Tx w={58} h={10} /></span><span><Tx w={70} h={10} /></span><span><Tx w={76} h={10} /></span><span><Tx w={64} h={10} /></span></div>
        {TOP_ROWS.map((r, i) => <div className="top-row" key={i}>
          <span className="chan-rank"><Tx w={8} h={14} /></span>
          <span className="watch-member">
            <span className="watch-avatar"><Sk className="sk-round" w={32} h={32} /></span>
            <span className="watch-meta"><b><Tx w={r.name} h={13} /></b><em><Tx w={r.handle} h={11} /></em></span>
          </span>
          <span className="top-count"><Tx w={28} h={14} /></span>
          <span className="top-count"><Tx w={16} h={14} /></span>
          <span className="top-count"><Tx w={12} h={14} /></span>
        </div>)}
      </div>
      <div className="card">
        <SkTitle titleW={120} info action={<SkLink w={111} />} />
        <div className="watch-head"><span><Tx w={54} h={10} /></span><span><Tx w={54} h={10} /></span></div>
        {WATCH_ROWS.map((r, i) => <div className="watch-row" key={i}>
          <span className="watch-member">
            <span className="watch-avatar"><Sk className="sk-round" w={32} h={32} /></span>
            <span className="watch-meta"><b><Tx w={r.name} h={13} /></b><em><Tx w={r.handle} h={11} /></em></span>
          </span>
          <span className="watch-activity"><span className={`watch-dir ${i === 1 || i === 4 ? 'down' : 'up'}`}><Sk w={12} h={12} /></span><span className="watch-change"><Tx w={r.change} h={14} /></span></span>
        </div>)}
      </div>
    </div>
  </>
}

// --- Relationships -------------------------------------------------------

const GRAPH_LEGEND = [
  { cls: 'swatch strong', w: 115 },
  { cls: 'swatch mid', w: 96 },
  { cls: 'swatch weak', w: 108 },
  { cls: 'bridge-dot', w: 86 },
]

const DIST_ROWS = [
  { label: 121, count: 36, pct: 88 },
  { label: 148, count: 35, pct: 42 },
  { label: 96, count: 32, pct: 24 },
  { label: 172, count: 32, pct: 14 },
]

const INF_ROWS = [
  { name: 96, sub: 74 },
  { name: 84, sub: 82 },
  { name: 92, sub: 66 },
  { name: 88, sub: 78 },
  { name: 110, sub: 70 },
]

function RelationshipsSkeleton() {
  return <>
    <SkHeader cls="sticky-compact" titleW={175} subW={440} action={<SkDateControl />} />
    <SkMetrics titleW={138} info="all" noLastChange labels={[138, 168, 176, 58]} values={[64, 64, 40, 20]} />
    <div className="card graph-card">
      <div className="graph-head">
        <div className="graph-stat">
          <span className="stat-title"><Tx w={92} h={14} /></span>
          <div className="graph-stat-row"><b><Tx w={75} h={28} /></b><SkChange em={58} /></div>
        </div>
        <div className="graph-controls">
          <div className="graph-filter"><button className="graph-filter-btn" type="button" tabIndex={-1}><Sk w={16} h={16} /><Tx w={35} h={14} /></button></div>
          <div className="graph-search"><Sk w={16} h={16} /><Tx w={180} h={14} /></div>
          <button className="graph-fullscreen-btn" type="button" tabIndex={-1}><Sk w={16} h={16} /></button>
        </div>
      </div>
      <div className="graph-filters" />
      <div className="graph-wrap">
        <div className="graph-canvas" />
        <div className="graph-loading" role="status" aria-label="Building graph">
          <img className="graph-loading-logo" src={MithrilIcon} alt="" />
          <span className="graph-loading-label">Building graph…</span>
        </div>
        <div className="graph-legend">
          {GRAPH_LEGEND.map((l, i) => <span className="legend-item" key={i}><i className={l.cls} /><Tx w={l.w} h={14} /></span>)}
        </div>
      </div>
    </div>
    <div className="bottom-grid rel-bottom-grid">
      <div className="card">
        <SkTitle titleW={176} />
        <div className="dist-rows">
          {DIST_ROWS.map((r, i) => <div className="dist-row" key={i}>
            <div className="dist-label"><span><Tx w={r.label} h={14} /></span></div>
            <div className="dist-bar-row">
              <div className="dist-bar"><i style={{ width: `${r.pct}%`, background: 'var(--surface-tertiary)' }} /></div>
              <div className="dist-count"><b><Tx w={r.count} h={14} /></b><span><Tx w={35} h={14} /></span></div>
            </div>
          </div>)}
        </div>
        <div className="dist-foot"><Tx w={240} h={14} /></div>
      </div>
      <div className="card inf-card">
        <div className="card-title card-title-gap-xs">
          <h3><Tx w={124} h={14} /></h3>
          <div className="card-title-action"><span className="info-tip" tabIndex={-1}><Sk w={16} h={16} /></span></div>
        </div>
        <div className="inf-head"><span><Tx w={84} h={12} /></span><span><Tx w={96} h={12} /></span></div>
        {INF_ROWS.map((r, i) => <div className="inf-row" key={i}>
          <span className="inf-rank"><Tx w={8} h={14} /></span>
          <span className="inf-id"><Sk className="sk-round" w={32} h={32} /><span className="inf-names"><span className="inf-name"><Tx w={r.name} h={14} /></span><span className="inf-sub"><Tx w={r.sub} h={12} /></span></span></span>
          <span className="inf-score"><Sk w={16} h={16} /><b><Tx w={20} h={16} /></b></span>
        </div>)}
      </div>
    </div>
  </>
}

// --- People --------------------------------------------------------------

const SHEAD_W = [54, 82, 61, 36, 45, 81, 89]
const PEOPLE_NAMES = [96, 84, 92, 88, 110, 76, 104, 80, 92, 68]
const PEOPLE_USERS = [58, 64, 54, 60, 56, 52, 66, 58, 50, 62]

function PeopleSkeleton() {
  return <section className="people-page">
    <div className="people-dock">
      <SkHeader cls="sticky-compact header-no-lift" titleW={95} subW={300} action={
        <div className="ph-actions"><button className="people-export" type="button" tabIndex={-1}><Sk w={20} h={20} /><Tx w={52} h={14} /></button></div>
      } />
      <div className="people-toolbar">
        <div className="people-search"><Sk w={16} h={16} /><Tx w={200} h={14} /></div>
        <div className="people-select"><button type="button" tabIndex={-1}><span className="ps-label"><span><Tx w={118} h={14} /></span></span><Sk w={16} h={16} /></button></div>
        <div className="people-filter"><button className="graph-filter-btn" type="button" tabIndex={-1}><Sk w={16} h={16} /><Tx w={44} h={14} /></button></div>
      </div>
      <div className="people-shead">
        <div className="pt-cell pt-check"><button type="button" className="pe-checkbox" tabIndex={-1} /></div>
        {SHEAD_W.map((w, i) => <div className="pt-cell" key={i}><Tx w={w} h={14} /></div>)}
      </div>
    </div>
    <div className="people-table-wrap">
      <div className="people-table">
        {PEOPLE_NAMES.map((nw, i) => <div className="pt-row" key={i}>
          <div className="pt-cell pt-check"><button type="button" className="pe-checkbox" tabIndex={-1} /></div>
          <div className="pt-cell"><div className="pt-member"><Sk className="sk-round" w={32} h={32} /><span className="pt-names"><button type="button" className="pt-name" tabIndex={-1}><Tx w={nw} h={14} /></button><span className="pt-username"><Tx w={PEOPLE_USERS[i]} h={12} /></span></span></div></div>
          <div className="pt-cell"><span className="tier-pill"><Tx w={64} h={14} /></span></div>
          <div className="pt-cell"><span className="pt-influence"><Sk w={16} h={16} /><b><Tx w={18} h={14} /></b></span></div>
          <div className="pt-cell"><div className="pt-roles"><span className="role-pill"><i className="role-dot sk" /><Tx w={56} h={12} /></span><span className="role-pill more"><Tx w={20} h={12} /></span></div></div>
          <div className="pt-cell pt-num"><Tx w={84} h={14} /></div>
          <div className="pt-cell pt-num"><Tx w={50} h={14} /></div>
          <div className="pt-cell"><Sk w={120} h={15} /></div>
        </div>)}
      </div>
    </div>
    <div className="people-pagination">
      <div className="pp-left">
        <div className="pp-rows"><span className="pp-rl"><Tx w={82} h={12} /></span><button type="button" className="pp-rv" tabIndex={-1}><Tx w={18} h={12} /><Sk w={14} h={14} /></button></div>
        <Tx w={210} h={14} />
      </div>
      <div className="pp-right">
        <button type="button" className="pp-page" tabIndex={-1}><Sk w={12} h={12} /></button>
        {[1, 2, 3, 4].map((n) => <button type="button" className="pp-page" key={n} tabIndex={-1}><Sk w={8} h={10} /></button>)}
        <button type="button" className="pp-page" tabIndex={-1}><Sk w={12} h={12} /></button>
      </div>
    </div>
  </section>
}

// --- entry points --------------------------------------------------------

export function PageSkeleton({ page }: { page: PageKey }) {
  return <div className="sk-page" aria-hidden="true">
    {page === 'Engagement' ? <EngagementSkeleton />
      : page === 'Relationships' ? <RelationshipsSkeleton />
      : page === 'People' ? <PeopleSkeleton />
      : <OverviewSkeleton />}
  </div>
}

const BENCH_HEAD_W = [96, 104, 64, 64, 64, 64, 64]
const BENCH_COLS_W = [48, 44, 54, 44, 72, 56, 48, 48, 56, 56, 110, 44]
const BENCH_ROW_W = [40, 40, 34, 30, 44, 34, 30, 30, 34, 30, 76, 34]

export function BenchSkeleton() {
  return <div className="bench" aria-busy="true" aria-hidden="true">
    <div className="bench-head">
      <div>
        <h2><Tx w={240} h={24} /></h2>
        <p className="bench-sub"><Tx w={330} h={14} /></p>
      </div>
      <div className="bench-controls">
        {BENCH_HEAD_W.map((w, i) => <button className="btn btn-secondary" type="button" tabIndex={-1} key={i}><Sk w={w} h={14} /></button>)}
      </div>
    </div>
    <div className="bench-stage">
      <div className="bench-canvas"><span className="sk" style={{ position: 'absolute', inset: 24 }} /></div>
    </div>
    <table className="bench-table">
      <thead>
        <tr>{BENCH_COLS_W.map((w, i) => <th key={i}><Sk w={w} h={10} /></th>)}</tr>
      </thead>
      <tbody>
        {[0, 1, 2, 3, 4, 5].map((r) => <tr key={r}>{BENCH_ROW_W.map((w, i) => <td key={i}><Sk w={i === 0 ? w + 8 : w} h={12} /></td>)}</tr>)}
      </tbody>
    </table>
  </div>
}
