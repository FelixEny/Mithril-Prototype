import { useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { TIER_COLORS, formatNumber, formatPercent, type ActivityTier } from '../analytics'
import { DonutTooltip } from './ChartTooltip'

// Roster split by activity tier, as a donut with a value legend. Hovering a slice
// or a legend row isolates that tier in the centre total, which is the only way to
// read an exact count off a donut -- the arcs themselves carry no labels.
export function TierDonut({ tiers }: { tiers: { tier: ActivityTier; value: number }[] }) {
  const [active, setActive] = useState<string | null>(null)
  const sorted = [...tiers].sort((a, b) => b.value - a.value || a.tier.localeCompare(b.tier))
  const total = sorted.reduce((s, t) => s + t.value, 0)
  const centre = active ? sorted.find((t) => t.tier === active)?.value ?? 0 : total
  return <div className="participation">
    <div className="donut">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={sorted} dataKey="value" nameKey="tier" innerRadius={70} outerRadius={93} paddingAngle={2} startAngle={90} endAngle={-270} onMouseEnter={(_, i) => setActive(sorted[i].tier)} onMouseLeave={() => setActive(null)}>
            {sorted.map((x) => <Cell key={x.tier} fill={TIER_COLORS[x.tier]} fillOpacity={active && active !== x.tier ? 0.55 : 1} />)}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="total"><b>{formatNumber(centre)}</b><span>Members</span></div>
    </div>
    <div className="legend">
      {sorted.map((x) => <div key={x.tier} className={active === x.tier ? 'legend-item active' : 'legend-item'} onMouseEnter={() => setActive(x.tier)} onMouseLeave={() => setActive(null)}>
        <span className="label"><i style={{ background: TIER_COLORS[x.tier] }} /><span>{x.tier}</span></span>
        <span className="count"><b>{formatPercent((x.value / total) * 100)}</b><em>({formatNumber(x.value)})</em></span>
      </div>)}
    </div>
  </div>
}
