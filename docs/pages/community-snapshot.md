# Mithril Analytics - Community snapshot

## 1. Page purpose

The Community snapshot is the drill-down behind the Overview's Community
snapshot card (`View chart`). It answers one question with two charts: **how
large is the roster, and what moved it?** The top chart is the roster over the
selected range; the bottom chart is the membership flow that produced the net
change.

It is deliberately shallow: no cohort splits, no activity metrics, no tiers.
Everything deeper lives on Engagement, Members or Relationships, so this page
does not restate them.

## 2. Structure

Figma node `969:55971`. Top to bottom:

1. Breadcrumb `Overview > Community snapshot` (`mpp-*` styles, first crumb is a
   back button) with `DateRangePicker` on the right
2. One `Card` (`.snapshot-card`, radius 12, no card-level padding, no card title)
   containing, in order:
   - `CardTitle` "Total members" (`card-title-no-action`, no action control)
   - Stats row: 24px `totalMembers` value + `Change` chip
   - Area chart (`.snapshot-plot--area`)
   - `CardTitle` "Joined vs left"
   - Stats row: `joined` (green) and `left` (red) 24px values with labels
   - Bar chart (`.snapshot-plot--bars`)
   - Shared date label row (`.snapshot-dates`)

The date labels are one shared row at the bottom of the card (space-between,
12 labels max, 36px centred spans), not per-axis labels: a single row keeps the
two charts visually locked to the same x-scale and matches Figma.

## 3. Metrics

Values come from the `DashboardWindow` (`w`) that the Overview already computed
for the selected range, plus `effDays` for the `Change` chip. Nothing is
recomputed on this page.

| Section | Value | Source |
| --- | --- | --- |
| Total members | `w.totalMembers` | roster as of `w.end` |
| Total members (Change) | `w.delta.totalMembers` | `Change v range={effDays}` |
| Joined vs left | `w.joined` / `w.left` | joins and leaves inside the window |

`Change` chips use the same period-over-period percentage as the Overview card,
so the two screens never disagree.

## 4. Charts

Both charts use `membershipSeries(w.start, w.end)` (daily `MembershipPoint`s:
`label`, `date`, `roster`, `joined`, `left`).

### Total members (area)

- `AreaChart`, monotone curve, stroke `--chart-brand-1` at 2px, no dots,
  active dot r4 with a `--surface-primary` ring.
- Gradient fill `url(#snapshot-area-fill)`: stops styled via
  `.snapshot-grad-top` (`--chart-area-fill`, opacity .52) and
  `.snapshot-grad-bottom` (opacity 0), applied with `fillOpacity={0.23}`
  (mirrors the Figma node's own opacity layering).
- Y axis: `domain [0, roster.top]`, no ticks at zero by design of the nice-step
  helper (0 is included), width 38 (30px label column + 8px gap), labels
  12px `--content-tertiary`, formatted with `formatNumber`.
- Horizontal-only grid, `strokeDasharray="4 2"`, `--border-primary`.
- Tooltip: `ChartTooltip` with the point's date and `Total members: N`.
- Category X axis (hidden): Recharts `scalePoint` spans the plot edge-to-edge,
  which matches the Figma path that runs the full 1046px.

### Joined vs left (bars)

- `BarChart` with two stacked series, `stackId="flow"`:
  - `joined` — `--content-positive`, radius `[2,2,0,0]` (top)
  - `negLeft` (`-left`) — `--chart-negative`, radius `[0,0,2,2]` (bottom)
- Diverging axis: `domain [−neg, flowTicks.top]` with the zero baseline in
  between, so lefts render below zero in red and joins above in green.
- 28 day slots: `barCategoryGap="23%"` (Recharts treats the percent as the
  padding on each side of a band, so this renders ~half-band bars — the 20px at
  28 days that Figma shows — with `maxBarSize={20}` capping the wider spacing at
  7-day ranges).
- Tooltip: shared `.chart-tooltip` shell with `.chart-tooltip-row` rows
  (Joined green dot, Left red dot) and a grey row cursor
  (`cursor={{ fill: 'var(--surface-secondary)' }}`).

### Tick helpers

`rosterAxis` / `flowAxis` in `CommunitySnapshotPage.tsx` pick "nice" ticks from
`NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]`:

- Roster: step = `niceStep(max / 5)` (about five intervals), top rounded up to
  a whole step, ticks `0, step, …, top`.
- Flow: step = `niceStep(maxJoined / 3)` for the positive side, top rounded up,
  plus one negative tick at `−niceCeil(maxLeft)` when any leaves exist.

## 5. Navigation

- Entry: `View chart` on the Overview Community snapshot card. The Overview
  keeps a local `snapshot` flag (`useState`) and renders this page in place of
  its own JSX — same pattern as People → member profile. The sidebar stays on
  Overview; no new `PageKey`, no hash route.
- Exit: the `Overview` breadcrumb crumb (`onBack`) clears the flag.

## 6. Design notes

- New tokens: `--chart-negative` (`Color/Red/200`, `#FF3838`) and
  `--chart-area-fill` (`#5926C8`, the Figma gradient value, documented in
  `docs/design.md` under Chart).
- Card children own their own padding (CardTitle `16/16/8`, stats `8/16/12`,
  area chart `8/16/12/12`, bars `8/16/4/12`, dates `0/16/12/50`); the card
  itself has `padding: 0`.
- Chart plot divs are `200px` (area) and `172px` (bars) tall with padding, plus
  Recharts margins `8/0/8/0`, so tick baselines land where Figma places them.
