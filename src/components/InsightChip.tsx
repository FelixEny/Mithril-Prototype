import type { InsightTone } from '../overview-insights'

// Category tag for an insight column. The four tones are the whole vocabulary, so
// the colour is carried entirely by `tone` -- never passed in as a colour.
export function InsightChip({ tone, children }: { tone: InsightTone; children: React.ReactNode }) {
  return <span className={`insight-chip ${tone}`}>{children}</span>
}
