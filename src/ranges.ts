// Reporting-period presets, in one place because three call sites depend on the
// exact set and cannot drift: the picker's list, the app's initial range, and
// the layout gate in scripts/check-layout.mjs.
//
// `RangeDays` is a window LENGTH in days, measured backwards from the corpus'
// endDate. The window is inclusive of both endpoints, so a 7-day preset spans
// eight calendar days (31 Aug - 7 Sep for an endDate of 7 Sep). Every surface
// that shows a range derives it from `RANGE_PRESETS`, so the label a row prints
// and the dates it prints beside itself can never disagree.
export type RangeDays = 7 | 14 | 28 | 84

export interface RangePreset {
  days: RangeDays
  label: string
}

// 28 days rather than 30, because the activity tiers and the trailing-28-day
// snapshot the Overview headlines already measure in 28-day windows -- a 30-day
// picker default measured a window nothing else on the page measured. 84 days
// is the 12-week ceiling: the longest range the graph layout was fitted for and
// the longest preset the calendar offers.
export const RANGE_PRESETS: RangePreset[] = [
  { days: 7, label: 'Last 7 days' },
  { days: 14, label: 'Last 14 days' },
  { days: 28, label: 'Last 28 days' },
  { days: 84, label: 'Last 12 weeks' },
]

export const DEFAULT_RANGE: RangeDays = 28

export const presetLabel = (days: RangeDays): string =>
  RANGE_PRESETS.find(p => p.days === days)?.label ?? `Last ${days} days`