# Mithril Analytics - Overview

## 1. Page purpose

The Overview is the screen a Community Manager opens first. It answers one
question: **what should I look at?** Everything below the lead story is ranked by
how much it changes a decision, not by how easy it is to compute.

The page deliberately does not restate metrics that a dedicated page owns in more
depth. Community strength appears here as a single gauge plus its four weighted
components; the Relationships page is where the graph, the clusters, and the
per-member explanations live. The same is true for the tier donut (Engagement) and
the channel and discussion tables (Engagement).

## 2. Structure

Top to bottom, in Figma v1 order (`947:53781`):

1. Greeting and date range picker (`PageHeader`)
2. Lead story
3. Four membership stat cards
4. Community strength
5. Community insights (four columns)
6. Activity tier distribution and Mithril feed

## 3. Greeting

`greeting(now)` in `src/overview.ts` resolves from the viewer's local hour — the
PC's own timezone via `getHours()`, deliberately *not* the corpus timezone, since
it is a greeting to the person looking at the screen. Four bands, each with a
matching emoji:

| Local hour | Greeting |
| --- | --- |
| `h < 12` | `Good Morning` 🌅 |
| `h < 18` | `Good Afternoon` ☀️ |
| `h < 22` | `Good Evening` 🌆 |
| otherwise | `Good Night` 🌙 |

Both words are capitalised. The function returns `{ text, emoji }` rather than one
string so the emoji can be wrapped in `.greeting-emoji` and sized independently —
see the type scale in `docs/design.md` for why it is 20px against the 24px wordmark.
The words render at 24px Medium in `--content-secondary` — a greeting, not a page
title, so it is set quieter than the 28px Semibold primary headings on the other
pages. It is evaluated at render time, so it does not tick over while the page
stays open. The emoji is `aria-hidden`, since the band is already named by the
words beside it.

It does **not** name a person. Mithril has no account model in the prototype, and
a hard-coded name would assert something the data does not know. Figma's "Good
Morning Felix 🌅," is placeholder copy for a state the prototype does not model.

## 4. Lead story

One sentence at 36px Medium, with a 24px (`--space-2xl`) bottom margin. Its
load-bearing figures are set in `--content-primary` at Semibold while the
connective grammar stays in `--content-secondary` Medium. `overviewStory()`
returns an array of runs rather than a string precisely so that emphasis can land
on the numbers. The `56ch` measure is the content column itself — `main` caps at
`1440px` and its sidebar margin plus padding leave `1368px` — so the lead story is
never held narrower than the grid it sits in. It does not lengthen the sentence:
the single-clause story measures `932px` of ink and the two-clause one `1606px`
against a `1357px` box, and `text-wrap: balance` keeps the long form's two lines
near-equal, so no value of the measure changes a line break. See `design.md` for
the full measurement.

Membership direction leads, because it is the only thing on this screen that
changes hands.

The second clause appears **only when retention moves against membership**. When
the two agree, restating it is noise; when they disagree, the contradiction is the
most useful sentence on the page. Half a point is treated as no movement.

## 5. Membership stat cards

Four cards, each with a sparkline:

| Card | Value | Change | Sparkline | Series |
| --- | --- | --- | --- | --- |
| Total members | `totalMembers` (roster as of `end`) | `delta.totalMembers` | area | `roster` |
| Active members | `current.active` | `delta.active` | area | `active` |
| New members | `joined` | `delta.joined` | bars | `joined` |
| Server leaves | `left` | `delta.left`, `invert` | bars | `left` |

All four deltas are percentages against the equally-long prior window, computed by
`dashboardWindow` from the roster at the window's start (not today's roster) and
the prior window's joins and leaves.

Server leaves is the only card with `invert`: its arrow direction tracks the raw
number while its colour tracks goodness, so a drop in departures reads as a
downward green-neutral arrow rather than a downward red one. This behaviour is
intentional.

### Area vs bars

The chart type follows the series, not the card:

- **Level series** (`roster`, `active`) use `SparkArea`, because a level series needs
  its *slope*. Bars are sized against the tallest bar in the run, and the roster only
  moves 2379 → 2507 across the longest window — under bars every bar lands within ~2px of the
  tallest, so the chart is a solid block that reports nothing.
- **Flow series** (`joined`, `left`) stay on `SparkBars`, because a bar length means
  "this many happened in this bucket". An area would imply continuity between
  discrete daily events that isn't there.

`SparkArea`'s domain is the series' own `[min, max]`, **not zero**. This is the one
deliberate departure from the zero-baseline rule, so it is worth recording: in a bar
chart the *length* is the encoding, so the baseline must be zero for the length to
mean anything. In an area chart the encoding is the shape of the top edge, and
against zero a 5% roster change is a line sitting at 95% of full height for the whole
run — the same dead chart in different clothes. The slope stays proportional; only the
vertical offset is chosen to use the box. Do not "correct" this to a zero baseline.

`SparkArea` also carries `vector-effect="non-scaling-stroke"` because the viewBox is
stretched non-uniformly to fill the card; without it the 1.5px line renders up to
~2.5× thicker horizontally than vertically.

### Sparkline construction

`overviewSparkBars(w)` calls `membershipSeries(start, end)`, which emits one
point per day across the **full** window (no 30-day cap, unlike
`DashboardWindow.series`):

- The level series (`roster`, `active`) are point-in-time counts at each bucket's
  close.
- The flow series (`joined`, `left`) are per-bucket intervals using `(start, end]`,
  which is the same half-open convention as `w.joined` / `w.left`, so the bucket
  sums reconcile exactly with the stat cards.

Longer windows are resampled to `SPARK_BUCKETS` (28). Levels are **averaged** and
flows are **summed**: averaging joins would invent fractional members per day, and
summing a roster would report the window over and over.

An 84-day (12-week) window therefore still draws 28 points at the same weight as a 28-day one,
and the flow bars stay proportional to the totals the card above them reports. A
7-day window yields fewer than 28 points, so its area is correspondingly more angular.

## 6. Community strength

The shared `StrengthCard` component, rendered with `showFoot={false}`.

The card title carries **no** supporting action: an earlier version summarised the
weights there (`Weights · Connectedness 35% · …`), but each bar row already labels
its own `% weight`, so the summary only repeated them. Dropping the `action` also
means `CardTitle` applies `card-title-no-action`, which sets a 16px title padding in
place of the 12px `metrics-title` padding.

### Basis window

The score is pinned to a **fixed 28-day basis** (`STRENGTH_BASIS_DAYS`) and does
**not** respond to the date picker's length. An edge only exists once a pair clears
two interactions across two days, so every component is a function of how long you
watched — on this corpus connectedness reads 10.8 / 15.8 / 24.0 / 35.4 at
7 / 14 / 28 / 84 days. That is a measurement artifact, not the community changing.

What *is* pinned is the length, not the end date. All presets end at `endDate`, so
switching 7d → 84d leaves the score byte-identical, while a custom end date does move
it — that is a genuine 28-day period compared like-for-like against the 28 days
before it, the same equal-length comparison `strengthDelta` already makes.

The card titles its own basis (`meta="Trailing 28 days"`), so it reads as deliberate
rather than broken when the presets change nothing. 28 rather than 30 to match the
trailing-28-day activity snapshot the donut beside it reports;
`weeksIn = round(days/7) = 4` at both lengths, so the consistency term is identical.

`strengthSnapshot(end)` in `src/relationships.ts` serves this. It runs `buildCore`
twice over the basis window and its equal-length predecessor and returns only the
score, the delta and the four components — it deliberately bypasses
`relationships()`, which would build the full edge/cluster/influence graph for a
second window just to read six numbers.

All four component bars use `--chart-brand-mid` (`Color/Brand/100`, `#B9A8FA`)
regardless of value. Bar colour therefore carries **no** signal — the `/100` score
and the bar length do that work. (This replaced a conditional that painted bars at
80 or above in `--score-7` green, which left `--score-7` unused.)

The footer ("What drives this score?") is suppressed here because the card
already lists all four weighted components as bars directly beneath the gauge;
repeating their definitions immediately below them is noise. The component, the
weights, and the definitions live in `src/components/StrengthCard.tsx` so the two
pages cannot drift apart.

This is the only page that presents Community Strength. It previously also
appeared on the Relationships page; those metric definitions moved here with it.

### Calculation

```text
Community Strength =
  Connectedness × 0.35
+ Participation × 0.30
+ Distribution × 0.20
+ Relationship Quality × 0.15
```

### Connectedness — 35%

Measures how much of the community has meaningful relationships.

```text
Connectedness =
  Connected Members ÷ Total Members × 100
```

A member is Connected when they have 2 or more meaningful connections.

### Participation — 30%

Measures whether connected members are actively maintaining their relationships.

```text
Participation =
  Connected Members who had at least one qualifying interaction
  with an existing connection during the selected period
  ÷ Connected Members × 100
```

### Distribution — 20%

Measures whether meaningful connections are spread across the community or concentrated among a small group.

A community where most members have some meaningful connections should score higher than one where a small group holds most of the connections.

`Distribution = 100 × (1 − gini(degrees))`, and `gini()`'s weighted-sum form is only
valid on **ascending** input, so the degree list must be sorted before the call.
Passing it unsorted (members are not in degree order) collapsed the coefficient to 0
and pinned Distribution at a perfect 100 — a component that could never discriminate
between communities. This corpus reads ~13/100.

The calculation is internal. The Relationships page's Connection distribution
card is the visible representation of this underlying pattern.

### Relationship Quality — 15%

Measures the overall strength of meaningful relationships across the community.

- Strong = 100
- Mid = 60
- Weak = 20

```text
Relationship Quality =
  Weighted average relationship strength
  across meaningful relationships
```

## 7. Community insights

Four columns from `overviewInsights(w)`, rendered by
`src/components/CommunityInsight.tsx`. Each column stacks three parts, matching the
Figma `Insights` component:

| Part | Content | Weight |
| --- | --- | --- |
| Chip | What kind of observation this is | 12px |
| Title + detail | The movement, then the level against its prior window | 16px / 14px |
| Nested block | `Sparkle` + recommendation | 12px |
| Link | "view in …", a sibling *below* the block | 14px |

The link is a sibling of the tinted block, not a child of it. In Figma the
recommendation box and the link are separate items stacked in the column, so the
link sits on the white panel rather than on the block's `--surface-secondary`
fill. `.insight-block` keeps `margin-top:auto` to pin the block to the bottom of
the column, and the link follows it with the column's own 8px `gap`.

There is deliberately no big number in the block. The figures already appear in the
detail sentence, so a number there would spend the most prominent slot on the page
restating the line above it. What earns that slot is the action, and keeping every
figure in `detail` is what lets the recommendation stay readable prose — a
recommendation that quotes numbers is a second copy of the line above it.

The four are split two/two on purpose:

| Column | Kind | Source |
| --- | --- | --- |
| Needs attention | comparative | The rate metric with the most negative `delta` |
| Positive | comparative | The rate metric with the most positive `delta` |
| Opportunity | structural | `voiceOnly / active` |
| Notable | structural | `(Lurker + Inactive) / totalMembers` |

Rate metrics are compared in percentage points (`retention`, `activation`,
`activeRate`, `replyRate`, `reactionRate`). A movement under 0.5pp is rounding
noise, so the comparative columns fall back to naming the weakest/strongest
current level instead of inventing a direction.

Rate figures get one decimal (`formatRate`/`formatPp` in the module), not the
whole-number treatment `formatPercent` gives everything else. A rate that moved
0.6pp is the difference between `34%` and `34.6%`; at zero decimals the title
would claim a drop while the detail line underneath showed the same number twice.
Trailing `.0` is trimmed, so a rate that lands on a whole percent still reads
`28pp`, not `28.0pp`.

Every column is always populated. An empty column would read as "nothing to say"
on the screen whose whole job is to say something, and both structural columns
have a well-defined value on any window.

The Notable column is worded against the trailing 28 days, because
`DashboardWindow.tiers` is a 28-day count of the roster at `end` and is not
recomputed for the selected window. It must never be described as a movement over
the selected period.

### Navigation

Each column links to the page that goes deeper on its question: the three rate
columns to Engagement, Notable to Relationship. This is the only navigation on the
Overview, so `onNavigate` is declared on `OverviewPage` rather than added to the
shared `RangeProps` — that contract is about the date range, and the other four
pages should not have to accept a prop they never use. `App.tsx` passes its own
`navigate`. The link is a `<button>` rather than an `<a>`, so the hash stays
canonical.

The data layer decides *which* page answers a question but never navigates, which
is why `PageKey` is imported type-only into `overview-insights.ts`.

## 8. Activity tier distribution

The shared `TierDonut` component, identical to the Engagement page's. Hovering a
slice or a legend row isolates that tier in the centre total.

The card is a flex column (`min-height:360px`), so `.participation`'s existing
`flex:1` absorbs the slack the fixed radii leave behind and the donut-plus-legend
block sits vertically centred. Recharts centres the fixed-radius pie in the
taller viewport on its own, and the `.total` overlay (`inset:0`) stays glued to
it; the legend rows were already `justify-content:center`. The feed card in the
same grid is unaffected — `.feed` has no `flex:1`, so it keeps stacking from the
top exactly as before.

## 9. Mithril feed

Four digest rows from `buildMithrilFeed(w, connected)`. The four signals are
chosen to be *different from each other* and different from the cards directly
above, because the feed sits in the most prominent remaining position on the page:

| Icon | Item | Source |
| --- | --- | --- |
| Gauge | Share of members who are connected | `relationships().connectedCount` |
| Speaker | Busiest weekday and hour window | `peaks[0]` |
| Lightning | Top trending discussion | `discussionRows[0]` (channel + avatar stack) |
| Hash | Most active channel | `channelRows[0]` |

`connected` is passed in rather than derived inside the feed module: the network
engine is by far the most expensive call on the page, and the Overview already
runs it for the strength card directly above, so the figure is read off that same
result. `relationships()` is cached by window, so the Relationships page pays for
it once too.

### Row structure

Matches the Figma `Mithril feed` component: a 48px `--surface-secondary` circle
holding a 20px glyph, then a 14px/500 headline and a 14px/400 supporting line.
The supporting line is `[avatar stack, supporting text, timestamp]`, with the stack
leading — the text flexes and truncates, the timestamp is right-aligned.

Three affixes are optional, and each is optional because the data is, not for
layout reasons:

- **Channel tag** — `--surface-brand-light` at 8px radius with a 20px `Hash`.
- **Avatar stack** — 20px faces with a −6px overlap, ending in a brand-filled
  `--content-brand` bubble rather than a fourth face. `avatarCount` is
  `participants - avatars.length`; the Figma stack's last element looks like an
  initial, but there is no fourth member to show, so it reads `+N`.
- **Timestamp** — only the discussion row has one. The other three rows are window
  aggregates ("x% of members are connected", "busiest on Tuesday 6pm"), which have
  no occurrence time; printing `2d ago` beside them would assert a moment the data
  does not have. `discussionRows.lastAt` is the newest message in the row's 3-hour
  activity slice, and `ago()` measures it against the corpus' own `endDate` rather
  than the wall clock, since the generated data ends in 2024.

Figma's row copy is placeholder text ("40 people out of 1,245", "from 24 to 36").
Ours is computed from the corpus, so the numbers and phrasing differ by design.

## 10. Metric relationships and non-duplication rules

- Lead story membership figures and the Total members card are the same number.
  The story states movement; the card states the level.
- New members and Server leaves are absolute counts for the selected window. Their
  change chips compare against the prior window and are not derived from the
  story.
- Community strength renders only here. The Relationships page no longer shows the
  card, so there is no second copy to keep in sync.
- The Opportunity column repeats the voice-only ratio that Engagement surfaces in
  its own insight banner, but against the Overview's active-member denominator.
- The tier donut and the Notable column are both derived from `w.tiers`. The donut
  gives the full split; Notable gives the single quiet-share headline.

## 11. Implementation notes

- `OverviewPage` reads `DashboardWindow` through `dashboard(range)` or
  `dashboardWindow(custom.from, custom.to)` so a custom range is honoured end to
  end. It must not hardcode `endDate` as the window's end.
- The page is gated on `warm` in `App.tsx`, like Relationships and People. It runs
  the network engine, which must not execute inside another page's first paint.
- `overviewFindings()` is retained in `src/overview.ts` and documented, but is not
  rendered on this page. The four insight columns answer the same question in the
  four-column shape Figma specifies.