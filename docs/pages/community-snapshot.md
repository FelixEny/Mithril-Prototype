# Mithril Analytics - Community snapshot

## 1. Page purpose

The Community snapshot is the drill-down behind the Overview's Community
snapshot card (`Explore`). It answers one question with two charts and the names
behind them: **how large is the roster, and what moved it?** The top chart is
the roster across the selected reporting period; the bottom chart is the
membership flow that produced the net change; below them, two side-by-side lists
name every member who joined and every member who left in that same period.

This is the one surface with a reporting-period picker. The Overview deliberately
pins everything to a trailing 28 days, so the drill-down owns its own window
(`RangeDays` presets plus a custom calendar range) and defaults to `DEFAULT_RANGE`
(28 days) — the same window the Overview card it was opened from was showing.

It stays shallow on purpose: no cohort splits, no activity metrics, no tiers.
The lists are a movement log (who and when), not a member table — everything
deeper lives on Engagement, Members or Relationships, so this page does not
restate them.

## 2. Structure

Figma node `969:55971`. Top to bottom:

1. Breadcrumb row (`.mpp-header`: `Overview > Community snapshot`, first crumb is
   a back button; `DateRangePicker` on the right)
2. A card stack (`.snapshot-stack`, flex column, `--space-lg` gap) of three
   `Card`s (`.snapshot-card`, radius 12, no card-level padding, no card title),
   one per section so each chart owns its x-axis labels:
   - **Total members** — `CardTitle`, 24px `totalMembers` value + `Change` chip,
     roster line chart (`.snapshot-plot--area`) with its own Recharts x-axis ticks
   - **Joined vs left** — `CardTitle`, `joined` (green) / `left` (red) 24px
     values, bar chart (`.snapshot-plot--bars`) with its own Recharts x-axis ticks
   - **Member movement** — `CardTitle`, two-column movement lists
     (`.move-lists`)

Each chart draws its own day labels as real Recharts x-axis ticks (up to 12,
sampled from the plotted points, first and last always shown), so every label
sits exactly on its day's point or bar at any range length. There is no separate
label row: the earlier DOM date row could not track the chart's inner plot area
and drifted off the bars, and its fixed-width spans wrapped long labels ("Aug
12") while short ones ("Sep 1") stayed on one line. SVG tick text never wraps,
so every label is a single `Aug 10` line.

## 3. Metrics

The page computes its own `DashboardWindow` from its reporting period —
`dashboard(range)` for a preset, `dashboardWindow(custom.from, custom.to)` for a
custom calendar range — and `effDays` is the preset length or the rounded custom
span. Nothing is inherited from the Overview.

| Section | Value | Source |
| --- | --- | --- |
| Total members | `w.totalMembers` | roster as of `w.end` |
| Total members (Change) | `w.delta.totalMembers` | `Change v range={effDays}` |
| Joined vs left | `w.joined` / `w.left` | joins and leaves inside the window |
| Member movement lists | `membershipFlow(w.start, w.end)` | the `Member[]` behind those counts |

`Change` chips use the same period-over-period percentage as the Overview card,
so the two screens never disagree at the shared 28-day default. The lists read
the same helper the charts' counts are built from, so the list lengths and the
stats row agree by construction (90 joined / 26 left at the 28-day default;
208 / 66 at 12 weeks).

## 4. Member movement lists

Two equal columns (`grid-template-columns: 1fr 1fr` under a 1px top rule, split
by a 1px vertical rule), each with a header — colour dot, label, right-aligned
count — and a scroll region (`max-height: 320px`, `overflow-y: auto`) so a
90-row month does not stretch the card.

- Rows are the real `Member` records from `membershipFlow`, newest first
  (`joinedAt` desc / `leftAt` desc).
- Row: 28px `Avatar` (`getMemberAvatar`) + name (14px medium) over `@username`
  (12px), with the timestamp trailing (12px `--content-tertiary`,
  tabular numerals).
- Timestamps use `formatTimestamp` (`analytics.ts`), which reads `getUTC*` like
  every other date label in the app — the data layer shifts raw timestamps +1h
  so UTC getters show Lagos wall-clock. Joins are hour-granular in the corpus
  (`:00`), leaves carry minutes.
- Lists apply the same `(from, to]` convention as the charts, and bots are
  excluded by `membershipFlow`.
- Empty states: "No members joined in this period." / "No members left in this
  period." (a window with no churn must not render a blank box).

Deliberately missing: leave reason, inviter, and tier. The source data has no
reason or referrer, and a leaver's tier resolves to Inactive at `w.end`
(`activityTiers` maps anyone off-roster to Inactive), so a tier column would
either read Inactive for every row or require a second per-departure tier pass.

## 5. Charts

Both charts use `membershipSeries(w.start, w.end)` (daily `MembershipPoint`s:
`label`, `date`, `roster`, `joined`, `left`).

### Total members (line)

- `LineChart` with a plain monotone line, stroke `--chart-brand-1` at 2px, no
  fill, no dots, active dot r4 with a `--surface-primary` ring.
- X axis: the point key is `M/D` (`MembershipPoint.label`, e.g. `8/10`); the
  axis passes up to 12 of those keys as explicit `ticks` (`interval={0}`). A
  custom `EdgeTick` renders each key as `Aug 10` (`shortTick` via `monthNames`),
  keeps the default tick position and styled tick class, and pins the anchor —
  first tick `start`, last tick `end` — so edge labels never clip into the
  y-axis or the card edge. (Custom ticks don't receive the formatted value, so
  there is no `tickFormatter` — formatting lives in the tick itself.) No tick
  line, no axis line, `tickMargin` 8, axis `height` 24.
- Y axis is data-driven, not zero-based: the helper takes the min and max of the
  plotted roster, pads the span to at least 5% of the latest total (2,507 →
  ~125), rounds the bounds outward to nice tick values, and returns explicit
  ticks (e.g. ~2,370–2,520 by 30 for the current window). Width 38 (30px label
  column + 8px gap), labels 12px `--content-tertiary`, formatted with
  `formatNumber`.
- Horizontal-only grid, `strokeDasharray="4 2"`, `--border-primary`.
- Tooltip: `ChartTooltip` with the point's date and `Total members: N`.
- Category X axis (hidden): Recharts `scalePoint` spans the plot edge-to-edge,
  which matches the Figma path that runs the full 1046px. The visible day labels
  are this card's own `.snapshot-dates` row, aligned to the plot area by the
  same 38px axis width and 50px left padding.

### Joined vs left (bars)

- `BarChart` with two series sharing `stackId="flow"` and
  `stackOffset="sign"`: the sign offset draws positives up from zero and
  negatives down in the same band — one full-width column per day, nothing
  summed (a plain stacked default would stack the negative segment on top of
  the positive one). Left is negated once in the data layer (`negLeft = -left`)
  before charting.
  - `joined` — `--content-positive`, radius `[2,2,0,0]` (top)
  - `negLeft` (`-left`) — `--chart-negative`, radius `[0,0,2,2]` (bottom)
- Both bars use a custom `shape` (`gapBar`) that insets the zero-facing edge by
  1px, so a day with both joins and leaves reads as two bars with a hairline
  gap rather than one continuous column. A dedicated `ReferenceLine y={0}`
  (`--content-tertiary`, 1px) makes the zero line unmistakable.
- Diverging axis: `domain [−neg, flowTicks.top]` with the zero baseline in
  between, so lefts render below zero in red and joins above in green.
- Day slots: `barCategoryGap="23%"` (Recharts treats the percent as the padding
  on each side of a band, so this renders ~half-band bars — the 20px at 28 days
  that Figma shows — with `maxBarSize={20}` capping wider spacing; at the shorter
  7/14-day presets the cap binds and bars stay 20px wide, and at 12 weeks the
  bands are narrow enough that they stay under it).
- Tooltip: shared `.chart-tooltip` shell with `.chart-tooltip-row` rows
  (Joined green dot, Left red dot) and a grey row cursor
  (`cursor={{ fill: 'var(--surface-secondary)' }}`).
- Same Recharts-owned x-axis ticks as the roster chart (same `tickLabels`, same
  `EdgeTick`), so labels sit centred under their bars.

### Tick helpers

`rosterAxis` / `flowAxis` in `CommunitySnapshotPage.tsx` pick "nice" ticks from
`NICE = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]`:

- Roster: pad the min–max span to at least 5% of the latest total around the
  data midpoint, step = `niceStep(span / 4)`, bounds rounded outward to whole
  steps, ticks from `lo` to `hi` by `step` (zero-based domains are gone — the
  axis follows the data).
- Flow: step = `niceStep(maxJoined / 3)` for the positive side, top rounded up,
  plus one negative tick at `−niceCeil(maxLeft)` when any leaves exist.

## 6. Navigation

- Entry: `Explore` on the Overview Community snapshot card. The Overview
  keeps a local `snapshot` flag (`useState`) and renders this page in place of
  its own JSX — same pattern as People → member profile. The sidebar stays on
  Overview; no new `PageKey`, no hash route.
- Exit: the `Overview` breadcrumb crumb (`onBack`) clears the flag.
- Reporting period: `DateRangePicker` in the `.mpp-header` (right side, the
  header is `space-between`), driven by this page's own `range`/`custom` state
  (`DEFAULT_RANGE` = 28 days, resetting `custom` on preset click) — the same
  component and contract Engagement, People and Relationships use.

## 7. Design notes

- Token: `--chart-negative` (`Color/Red/200`, `#FF3838`), documented in
  `docs/design.md` under Chart. (The roster chart is a plain line, so no
  gradient-area token is in use — a gradient under a non-zero baseline would read
  as a floating band rather than volume-from-zero.)
- Card children own their own padding (CardTitle `16/16/8`, stats `8/16/12`,
  area chart `8/16/12/12`, bars `8/16/4/12`, dates `0/16/12/50`); each card has
  `padding: 0` and the stack spaces the cards with a `--space-lg` gap.
- Movement rows reuse the watch-row anatomy (`watch-row`-equivalent `.move-*`
  classes) but add a trailing timestamp column, so the lists need their own
  rules rather than the Engagement card's class names.
- Chart plot divs are `216px` (line) and `188px` (bars) tall with padding, plus
  Recharts margins `8/0/8/0`, so tick baselines land where Figma places them.
  (The heights grew 16px when the 24px x-axis moved inside the plot divs, keeping
  the grid/data region the same size it was with the old DOM label row.)
