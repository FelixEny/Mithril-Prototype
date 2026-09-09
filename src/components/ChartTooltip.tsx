import { formatNumber } from '../analytics'

export function ChartTooltip({ label, value }: { label: string; value: string }) {
  return <div className="chart-tooltip"><span className="chart-tooltip-label">{label}</span><span className="chart-tooltip-value">{value}</span></div>
}

export function LineTooltip({ active, payload, metric }: { active?: boolean; payload?: Array<{ value: number; payload: { date: string } }>; metric: string }) {
  if (!active || !payload?.length) return null
  return <ChartTooltip label={payload[0].payload.date} value={`${metric}: ${formatNumber(payload[0].value)}`} />
}

export function DonutTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) {
  if (!active || !payload?.length) return null
  return <ChartTooltip label={payload[0].name} value={`Members: ${formatNumber(payload[0].value)}`} />
}