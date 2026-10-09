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

Top to bottom, in Figma order (`963:55427`):

1. Greeting (`PageHeader`)
2. Lead story
3. Community snapshot (one card, four metric columns)
4. Community insights (four columns, grey card)
5. Community strength
6. Activity tier distribution and Mithril feed

The page has no date range picker: every card reads the same trailing 28 days.
There are no other surfaces to move independently, so the sections below never
describe a picker.

## 3. Greeting

`greeting(now)` in `src/overview.ts` resolves from the viewer's local hour — the
PC's own timezone via `getHours()`, deliberately *not* the corpus timezone, since
it is a greeting to the person looking at the screen. Four bands, each with a
matching glyph:

| Local hour | Greeting | Glyph |
| --- | --- | --- |
| `h < 12` | `Good Morning` | `sunrise` |
| `h < 18` | `Good Afternoon` | `sun` |
| `h < 22` | `Good Evening` | `cityscape-at-dusk` |
| otherwise | `Good Night` | `crescent-moon` |

The glyph value is the file name of a vendored Fluent Emoji SVG in
`public/emoji/`, not a Unicode codepoint — a codepoint would be drawn by
whatever emoji font the viewer's OS ships, so the greeting would render as a
different shape on every machine. Both words are capitalised. The function
returns `{ text, emoji }` rather than one string so the glyph can be rendered
as an `<img>` in `.greeting-emoji` and sized independently — see the type scale
in `docs/design.md` for why the box is 22px against the 24px wordmark.
The words render at 24px Medium in `--content-secondary` — a greeting, not a page
title, so it is set quieter than the 28px Semibold primary headings on the other
pages. It is evaluated at render time, so it does not tick over while the page
stays open. The glyph is `aria-hidden`, since the band is already named by the
words beside it.

It does **not** name a person. Mithril has no account model in the prototype, and
a hard-coded name would assert something the data does not know. Figma's "Good
Morning Felix 🌅," is placeholder copy for a state the prototype does not model —
and the one place a Unicode codepoint still appears in this repo, since it quotes
the design rather than rendering it.

## 4. Lead story

One sentence at 40px Medium on the full content-column measure (no `max-width`;
the sentence can span the same width as the metric card below it), with a 24px
(`--space-2xl`) bottom margin. `text-wrap: balance` keeps the two-clause
form's two lines near-equal. Its load-bearing figures are set in
`--content-primary` while the connective grammar stays in `--content-secondary`,
both at the same Medium weight — the same `{ts2}` (`#6B7280`) / `{ts3}`
(`#111928`) colour runs the design uses. `overviewStory()` returns an array of
runs rather than a string precisely so that emphasis can land on the numbers. See
`design.md` for the type scale.

Membership direction leads, because it is the only thing on this screen that
changes hands.

The second clause appears **only when retention moves against membership**. When
the two agree, restating it is noise; when they disagree, the contradiction is the
most useful sentence on the page. Half a point is treated as no movement.

## 5. Community snapshot

One card with an `Explore` link (to the Community snapshot page, see
`community-snapshot.md`) in its title and four
metric columns divided by hairlines, each holding a label, a 24px value and a
`Change` chip. There is no supporting line under the value: the
period-over-period comparison is entirely the chip, matching the design.

| Metric | Value | Change |
| --- | --- | --- |
| Total members | `totalMembers` (roster as of `end`) | `delta.totalMembers` |
| New members | `joined` | `delta.joined` |
| Server leaves | `left` | `delta.left`, `invert` |
| Active member rate | `current.activeRate` | `delta.activeRate` (pp) |

Only Active member rate carries the info tooltip (`metricInfo['Active member
rate']`), matching the tooltip Figma placed on that column. The three count
deltas are percentages against the equally-long prior window, computed by
`dashboardWindow` from the roster at the window's start (not today's roster) and
the prior window's joins and leaves.

Server leaves is the only metric with `invert`: its arrow direction tracks the raw
number while its colour tracks goodness, so a drop in departures reads as a
downward green-neutral arrow rather than a downward red one. This behaviour is
intentional.

Active member rate is `current.activeRate` — `active.size / rosterInWindow`,
the share of the window's roster that performed at least one qualifying
activity. It is a rate, so its chip compares in percentage points
(`delta.activeRate`, `pp: true`) like Reply rate on Engagement, rather than as a
percentage against the prior window.

## 6. Community strength

The shared `StrengthCard` component, rendered with `showFoot={false}`.

The card title carries **no** supporting action: an earlier version summarised the
weights there (`Weights · Connectedness 35% · …`), but each bar row already labels
its own `% weight`, so the summary only repeated them. Dropping the `action` also
means `CardTitle` applies `card-title-no-action`, which sets a 16px title padding in
place of the 12px `metrics-title` padding.

### Basis window

The score (like every card on the page) reads a **fixed trailing 28-day window**
(`STRENGTH_BASIS_DAYS`); the Overview has no date picker, so the length is not a
choice. An edge only exists once a pair clears
two interactions across two days, so every component is a function of how long you
watched — on this corpus connectedness reads 10.8 / 15.8 / 24.0 / 35.4 at
7 / 14 / 28 / 84 days. That is a measurement artifact, not the community changing.

The window ends at `endDate`, and when the trailing days do move that is a genuine
28-day period compared like-for-like against the 28 days before it, the same
equal-length comparison `strengthDelta` already makes.

The card titles its own basis (`meta="Trailing 28 days"`), matching the other
cards on the page.
28 rather than 30 to match the
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

Four columns from `overviewInsights(basis)`, rendered by
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
the column, and the link follows it 12px below (the column's 8px `gap` plus a
4px `margin-top` on the link itself). The title and detail hold a 4px gap
inside `.insight-text`; the link's trailing gap to the column edge stays at the
column's 4px bottom padding.

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
`DashboardWindow.tiers` is a 28-day count of the roster at `end`. It must never
be described as a movement over the window.

### Basis window

Every column reads the page's fixed **trailing 28-day** window
(`STRENGTH_BASIS_DAYS`), the same window the strength card and the snapshot card
use. There is no picker to switch lengths against, so the four insight columns
cannot drift from the metrics above them. The detail sentences' "against X% in
the previous `days`" therefore always reads the previous 28 days, and the
comparative deltas are 28d-vs-prior-28d.

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

The card is a flex column (`min-height:360px`), so `.participation`'s `flex:1`
absorbs the slack the fixed radii leave behind and the donut-plus-legend pair
sits vertically centred — and, with `justify-content:center`, horizontally
centred too. The donut box hugs the fixed-radius pie (`width:218px` against
186px of ink) instead of stretching to half the card, so the whitespace lands
roughly equally on both sides rather than pooling left of the pie. Recharts
centres the pie in its box on its own, and the `.total` overlay (`inset:0`)
stays glued to it; the legend keeps its 50% column (capped at `340px`) with
`justify-content:center` rows. The feed card in the same grid is unaffected —
`.feed` has no `flex:1`, so it keeps stacking from the top exactly as before.

## 9. Mithril feed

Four digest rows from `buildMithrilFeed(basis, connected)`. The four signals are
chosen to be *different from each other* and different from the cards directly
above, because the feed sits in the most prominent remaining position on the page:

| Icon | Item | Source |
| --- | --- | --- |
| Gauge | Share of members who are connected | `relationships().connectedCount` |
| Speaker | Busiest weekday and hour window | `peaks[0]` (ranked by the active-weighted score, with active members alongside) |
| Lightning | Top trending discussion | `discussionRows[0]` (channel + avatar stack) |
| Hash | Most active channel | `channelRows[0]` |

`connected` is passed in rather than derived inside the feed module: the network
engine is by far the most expensive call on the page, and the feed reads it off
the same fixed 28-day `basis` window the strength card directly above uses
(`relationships(basis)`, cached by window), so the figure and the gauge never
disagree about the period. `relationships()` is cached by window, so the
Relationships page pays for it once too.

Like the insights and the strength card, the feed is pinned to that fixed
trailing-28-day basis: all four rows are 28-day aggregates (`peaks`,
`discussionRows`, `channelRows`, connectedness), so switching 7d → 84d leaves the
feed byte-identical and only a custom end date moves it.

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

- Lead story membership figures and the Total members metric are the same number.
  The story states movement; the metric states the level.
- New members and Server leaves are absolute counts for the trailing 28 days.
  Their change chips compare against the prior window and are not derived from
  the story.
- Active member rate is the share of the window's roster that was active
  (`current.activeRate`), the same roster `totalMembers` states, so the two share
  a denominator. Its chip is read in percentage points.
- Community strength renders only here. The Relationships page no longer shows the
  card, so there is no second copy to keep in sync.
- The Opportunity column repeats the voice-only ratio that Engagement surfaces in
  its own insight banner, but against the Overview's active-member denominator.
- The tier donut and the Notable column are both derived from `w.tiers`. The donut
  gives the full split; Notable gives the single quiet-share headline.

## 11. Implementation notes

- `OverviewPage` reads a single fixed window through
  `dashboard(STRENGTH_BASIS_DAYS)` — there is no date picker, so no `RangeProps`.
  The window ends at `endDate` because `dashboard` ends there; the page pins the
  length (trailing 28 days), never the end date.
- The page is gated on `warm` in `App.tsx`, like Relationships and People. It runs
  the network engine, which must not execute inside another page's first paint.
- `overviewFindings()` is retained in `src/overview.ts` and documented, but is not
  rendered on this page. The four insight columns answer the same question in the
  four-column shape Figma specifies.