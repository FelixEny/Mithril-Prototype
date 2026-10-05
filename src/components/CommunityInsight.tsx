import { ArrowRight, Sparkle } from '@phosphor-icons/react'
import type { InsightTone } from '../overview-insights'
import { InsightChip } from './InsightChip'
import type { PageKey } from './Sidebar'

// One of the four columns in the Overview's Community insights card, mirroring the
// Figma `Insights` component. Three stacked parts:
//
//   chip          what kind of observation this is
//   title + detail what changed, and the level against its prior window
//   block         what to do about it, plus the page that goes deeper
//
// The block is deliberately *not* a big number. The figures already live in the
// detail sentence, so repeating one there would spend the most prominent slot on
// the page restating the line above it. What earns that slot is the action.
export function CommunityInsight({ tone, label, title, detail, recommendation, link, linkLabel, onNavigate }: {
  tone: InsightTone
  /** Chip text. */
  label: string
  /** The movement, as a headline. */
  title: string
  /** The level, against the prior window. */
  detail: string
  /** What a CM could do about this. Carries no figures; they are in `detail`. */
  recommendation: string
  /** Page the link opens. */
  link: PageKey
  linkLabel: string
  onNavigate: (page: PageKey) => void
}) {
  return <div className="insight-col">
    <InsightChip tone={tone}>{label}</InsightChip>
    <div className="insight-text">
      <p className="insight-title">{title}</p>
      <p className="insight-detail">{detail}</p>
    </div>
    <div className="insight-block">
      <p className="insight-recommend"><Sparkle size={16} weight="fill"/><span>{recommendation}</span></p>
    </div>
    {/* A button, not an anchor: navigation goes through the app's own
        `navigate` so the hash stays canonical. See OverviewPage's `onNavigate`.
        A sibling of the tinted block, not a child of it: Figma stacks the
        recommendation box and the link as separate items in the column. */}
    <button type="button" className="insight-link" onClick={() => onNavigate(link)}>{linkLabel}<ArrowRight size={16}/></button>
  </div>
}