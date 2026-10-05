import { Card } from './Card'
import { CardTitle } from './CardTitle'
import { Change } from './Change'
import { Gauge } from './Gauge'
import { Label } from './Label'
import { STRENGTH_BASIS_DAYS } from '../relationships'

export interface StrengthDimension {
  label: string
  /** 0-100. */
  value: number
  /** Share of the composite score, 0-1. */
  weight: number
  /** Plain-language definition, used by the footer. */
  def: string
}

type StrengthKey = 'connectedness' | 'participation' | 'distribution' | 'relationshipQuality'

// The four weighted components of the community score, in the order they are shown.
// Weights sum to 1, and the definitions double as the footer's "what drives this
// score?" text -- the weights are what make the composite legible, so the two cannot
// be edited independently.
export const STRENGTH_DIMENSIONS: { label: string; key: StrengthKey; w: number; def: string }[] = [
  { label: 'Connectedness', key: 'connectedness', w: 0.35, def: 'Share of members with at least two meaningful connections — at least 2 interactions with the same member across 2 or more days.' },
  { label: 'Participation', key: 'participation', w: 0.3, def: 'Connected members who had at least one qualifying interaction with an existing connection during the selected period.' },
  { label: 'Distribution', key: 'distribution', w: 0.2, def: 'How evenly meaningful connections are spread rather than concentrated in a small group — most members having some connections scores higher.' },
  { label: 'Relationship quality', key: 'relationshipQuality', w: 0.15, def: 'Weighted average relationship strength across meaningful relationships — Strong 100, Mid 60, Weak 20.' }
]

export const strengthDimensions = (rel: Record<StrengthKey, number>): StrengthDimension[] =>
  STRENGTH_DIMENSIONS.map((d) => ({ label: d.label, value: rel[d.key], weight: d.w, def: d.def }))

// The community's 0-100 network health: a gauge for the composite, one bar per
// weighted component underneath it. `showFoot` controls the "What drives this
// score?" explainer -- the Overview states the same four components as bars right
// beside the gauge, so repeating their definitions underneath it is noise there.
//
// `range` is the score's own basis window, NOT the page's selected date range:
// the score is calibrated for a single length and deliberately does not respond
// to the picker changing length, so the card titles that basis itself.
export function StrengthCard({ score, delta, range, dimensions, showFoot = true }: {
  score: number
  /** Change in score against the prior period of equal length, in points. */
  delta: number
  /** Length of the score's basis window in days, for the change caption. */
  range: number
  dimensions: StrengthDimension[]
  showFoot?: boolean
}) {
  return <Card className="strength-card">
    <CardTitle title="Community strength" meta={`Trailing ${STRENGTH_BASIS_DAYS} days`} className="metrics-title" />
    <div className="strength-body">
      <div className="strength-gauge">
        <Gauge value={score}>
          <span className="gauge-score"><b>{score}</b><span>/100</span></span>
          <span className="gauge-caption">Community score</span>
          <Change v={delta} range={range} unit="pts" />
        </Gauge>
      </div>
      <div className="strength-rows">
        {dimensions.map((d) => (
          <div className="strength-row" key={d.label}>
            <div className="strength-row-info">
              <div className="strength-row-title"><Label text={d.label} /><span className="strength-weight">{Math.round(d.weight * 100)}% weight</span></div>
            </div>
            <div className="strength-bar"><i style={{ width: `${d.value}%`, background: 'var(--chart-brand-mid)' }} /></div>
            <div className="strength-row-score"><b>{Math.round(d.value)}</b><span>/100</span></div>
          </div>
        ))}
      </div>
    </div>
    {showFoot && <div className="strength-foot">
      <div className="strength-foot-title">What drives this score:</div>
      {dimensions.map((d) => <div className="strength-foot-row" key={d.label}><b>{d.label}:</b><span>{d.def}</span></div>)}
    </div>}
  </Card>
}
