# Mithril Analytics — People (Members) Page

Locked product definitions for the People page, including the segment model.

## 1. Page purpose

People answers "who is in this community?" — a browsable, searchable table of
all members that can be filtered down and saved as a **segment** (a named,
reusable filtered list).

## 2. Table columns

Figma (v2, "People page" frames) defines these columns:

| Column | Content |
| --- | --- |
| **Member** | Avatar + display name (and username where space allows). |
| **Activity level** | One of Superuser / Contributor / Regular / Lurker / Inactive (trailing 28-day tier, shared with Engagement). |
| **Influence** | A 0–100 score over the trailing 28 days (same window as Activity level) — from reach, relationship quality and activity. Computed by `relationships.influenceEngine()`, the shared engine used identically by the Relationships page's Top influencers card and member popup, so a member always reads the same score everywhere. |
| **Roles** | Show only the **first** role; if the member has more, add a pill showing `+count`. Hovering the count pill shows a tooltip listing the remaining Discord roles. |
| **Date joined** | `joinedAt`. |
| **Last activity** | Most recent qualifying activity date. |
| **Activity graph** | Compact per-period activity sparkline for the member. |

Sorting, search, and pagination apply (Influence is sortable and filterable by
minimum score). Only member-generated activity counts; bots are excluded from
the table and analytics.

The People page has **no date-range picker**. Every value is fixed relative to
the data end ("now") and does not change with the dashboard's selected period —
including Influence, which is pinned to the trailing 28 days rather than the
picker window.

## 3. Filters

The filter dropdown offers three dimensions (Figma): **Activity level**,
**Roles**, and **Segments**. Second-level options render with **checkboxes** so
multiple values can be combined (e.g. Superuser + Contributor at once).

- Activity level filter → table shows members whose tier is in the selection.
- Roles filter → table shows members holding any selected role.
- Influence score filter → table shows members scoring at or above the chosen minimum (trailing 28-day Influence Score).
- Segments filter → table shows the segment's current membership (see §4).

Filters combine with search and row selection. The purple filter tag pattern
(relationship page) applies to active filters.

## 4. Segments

A segment is a saved filtered list. There are two creation flows:

1. **From selection (static):** with rows selected in the table, "Save as
   segment" snapshots the selected member ids into a static segment. Members
   never enter or leave a static segment.
2. **From filter (dynamic):** with filters applied, "Save as segment" stores
   the filter criteria. A dynamic segment is **re-evaluated at render time** —
   members enter as they meet the conditions and leave as they stop meeting
   them.

### Rules

- Dynamic segments evaluate **as of the data end ("now")**, independent of the
  page's date-range picker. This gives the time axis the Overview page needs to
  surface members entering/leaving a dynamic segment.
- Membership is computed by `src/segments.ts` (`segmentMembership`) against the
  per-member activity snapshot in `src/analytics.ts` (`activitySnapshot`,
  28-day trailing window by default). Both pages share this one engine; no
  membership is materialized in data.
- Bots never qualify for a segment.
- Built-in segments ship in `src/data/segments.json` (generated deterministically
  by `scripts/generate-data.mjs`); user-created segments persist to
  `localStorage` (`mithril.segments.v1`) and merge over built-ins at runtime.

### Criteria vocabulary (v1)

`archetypes`, `roles` (any-match), `activityTier` (trailing 28d),
`activeWithinDays`, `minMessagesWithinDays`, `joinedWithinDays`,
`joinedBeforeDays`. All days-based criteria are relative to the evaluation
`asOf` date.

### Seed segments

| id | name | kind | criteria |
| --- | --- | --- | --- |
| `seg_contributors` | Contributors | dynamic | `activityTier: [Contributor, Superuser]` |
| `seg_new_this_month` | New this month | dynamic | `joinedWithinDays: 28` |
| `seg_at_risk` | At risk | dynamic | `joinedBeforeDays: 60` + `activityTier: [Inactive]` |
| `seg_onboarded_7d` | Onboarded last 7 days | dynamic | `joinedWithinDays: 7` |
| `seg_alpha_builders` | Alpha builders | static | explicit member list (superusers + a Contributor subset) |

## 5. Overview integration

The Overview page (`OverviewPage`, model in `overview.ts`) surfaces segments whose
membership moved enough to be worth a CM's attention, using `segmentFlow(segment,
fromAsOf, toAsOf)` — a diff of `segmentMembership` at two "as of" points (weekly
cadence stepping back from the data end). No additional segment data is required.

A segment qualifies when **both** bars are cleared over the fixed 7-day finding
window:

- `|net| >= MIN_ABS_NET` (5 members), and
- `|net| / segment size >= MIN_SHARE` (10%).

At most three findings are ranked by share, then absolute net, then
user-defined segments ahead of built-ins at equal magnitude.

**Rolling cohorts are excluded.** Any segment whose criteria use
`joinedWithinDays` is skipped. Its membership diff is dominated by the cohort
definition itself — a window of N days always reports `~N` new members regardless
of whether anything is happening — so it passes any threshold by construction and
crowds out segments that actually moved. `joinedBeforeDays` segments are eligible:
their size varies with behaviour, not with the query window.

> With the shipped corpus this rule renders **zero** findings, so Overview shows
> the empty state. That is the intended behaviour of the gate, not a broken
> screen: the two cohorts that clear both bars are excluded as rolling, and no
> other segment moves 5 members and 10% of its own size in a week. The thresholds
> are the product's decision — loosening `MIN_SHARE` to ~4% would surface
> Contributors (-5 net, 4.2%), but that is a tuning call, not an implementation
> one.

## 6. Member profile

Clicking a member's name in the People table opens a dedicated profile screen
(`MemberProfilePage`, model in `member-profile.ts`). It draws on the same shared
corpus as the table, so the name, `@username`, tier, roles, Influence score and
avatar read identically on both surfaces.

### Layout

- **Breadcrumb:** `People / <name>` replaces the page header; back returns to the
  People list with the prior table state preserved.
- **Hero:** 88px avatar, display name + `@username`, activity tier pill, all role
  pills (dot + name), and a meta line of Joined, First active, Last active
  (relative "N days ago" / "Today").
- **Stat cards (4-across):** Influence score, Active days, Messages, Voice sessions.
- **Charts (2-up):** Activity over time (messages + reactions per day) and Most
  active channels (top 5 by messages with bars).

### Period scoping

Unlike the People table, the profile has a date-range picker. The reporting
window starts at the picker's selected start and always ends at the data end
("now").

- **Influence score stays pinned to the shared trailing-28-day engine**
  (`influenceEngine()`), the same score as the People table, Top influencers card
  and relationship popup — it does not move with the picker. Its delta compares
  the two adjacent 28-day windows ending at the data end.
- **Active days, Messages, Voice sessions, the activity chart and Most active
  channels are picker-scoped.** Their deltas compare against the immediately
  preceding window of equal length.
- No messages in the period renders Most active channels as an empty state
  ("No activity this period").

## 7. Do not

- Do not store dynamic segment membership in data files (it is computed).
- Do not couple segment criteria to the page date-range picker.
- Do not include bots in segments or the table.