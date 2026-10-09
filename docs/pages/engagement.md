# Mithril Analytics — Engagement Metrics

Locked product definitions and calculation rules for the Engagement page, including the updated peak-activity interpretation layer.

## 1. Page purpose

Engagement answers four questions:

- How many people participate?
- How deeply do they participate?
- When and where does participation happen?
- What conversations are gaining momentum?

## 2. Global rules

- The date picker controls the reporting period for period-based metrics and charts.
- Bots are excluded from member analytics.
- Members can leave the server. Every member-facing count is evaluated against the roster at a specific point in time: a member who left on 20 Aug is on the roster through 20 Aug and gone from 21 Aug. "Total members" style totals are point-in-time (as of the period end), while participation rates use the window roster described below.
- New Member Activation excludes members who left before completing their 7-day activation window, and Retention counts only members still on the roster at the start of the period. Departures are reported separately as churn rather than being folded into retention, so one member is never counted as both a departure and a retention loss.
- Qualifying activity is sending a message (replies included), sending a reaction, or participating in voice. Receiving a reaction does not count as activity. Active Members, activity days, and tiers all use this one definition.
- Member-generated messages are used for message metrics. Replies are messages and are included.
- Retention uses one canonical fixed 28-day definition across the product (Engagement headline + cohort chart, Overview insights + lead story). The date picker moves the observation point, never the window.
- Activity tiers use a trailing 28-day window, so the tier distribution is period-independent and does not change with the date range (see section 9).
- Voice is included in activity/active-member definitions but is not converted into an artificial message equivalent.

## 3. Top-level participation metrics

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Active Members** | Unique members who performed at least one qualifying activity during the selected period. | Qualifying activity: sent a message, added a reaction, or participated in voice. |
| **Active Member Rate** | Active Members ÷ window roster × 100. | Preferred label over "Participation Rate". The denominator is everyone on the server at any point in the selected period, not the end-of-period total: a member who was active in the window and then left could still participate, so dividing by the end-of-period roster overstates the rate and can exceed 100% over the longest window (12 weeks). |
| **New Member Activation** | Eligible new members who performed at least one qualifying activity within 7 days of joining ÷ eligible new members × 100. | Eligible members have had the full 7-day activation window. The headline covers the selected range's join cohort; the trend chart plots fully observed weekly join cohorts only, omitting the partial trailing week. |
| **28-day Retention** | Members active in the previous 28-day period, still on the roster at the start of the current 28-day period, and active again in the current 28-day period ÷ members active in the previous 28-day period who are still on the roster × 100. | Canonical retention metric; not a new-member metric. The cohort chart decomposes this rate by tenure at the window boundary: All members, New (<28 days), 28–90 days, 90–180 days. |

## 4. Message engagement

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Messages** | Total member-generated messages sent during the selected period. | Replies are messages and are included. |
| **Reply Rate** | Messages that received at least one reply ÷ all member-generated messages × 100. | A message with 10 replies counts once in the numerator. |
| **Reaction Rate** | Messages that received at least one reaction ÷ all member-generated messages × 100. | Measures the share of messages receiving any reaction. |

## 5. Voice engagement

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Voice Participants** | Unique members who participated in at least one Discord voice channel during the selected period. | Each member counts once. |
| **Total Voice Time** | Total elapsed time spent in voice channels during the selected period. | Keep this simple: total voice time, regardless of participant count. |
| **Voice-only Participants** | Voice participants whose only qualifying activity during the selected period was voice participation. | Shows engagement missed by message-only analytics. |

## 6. Activity over time

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Messages over time** | Member-generated messages for each displayed time interval across the selected date range. | Follows the date picker. |
| **Active Members over time** | Unique active members for each displayed time interval across the selected date range. | Display granularity may adapt to the selected range. |
| **Voice Participants over time** | Unique voice participants for each participation interval across the selected date range. | Uses voice participation data. |

## 7. Activity by day & time

The heatmap and the Peak activity panel share one underlying cell grid: every
day-of-week × hour-of-day cell in the selected window carries both an **average
active members** value and an **average messages** value (each divided by that
weekday's occurrence count in the window, matching the heatmap's existing
per-weekday normalization).

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Active members by day & time** | Average number of active members per day-of-week × hour-of-day cell across the selected range. | Active Members is the primary metric and drives the cell colors. Message volume rides alongside on the same cell and is surfaced in the tooltip and peak scoring. Uses the community's local timezone. Follows the date picker. |
| **Cell tooltip** | Weekday, hour, average active members, and average messages for that cell. | One fixed tooltip; there is no messages/active-members toggle. |
| **Peak scoring** | Active members and messages are each normalized to their own window max (0..1) so volume cannot dwarf the member count, then combined `0.7 × active + 0.3 × messages`. | Deterministic, shared scoring for peak detection, ranking, and the relative indicator. Active members are deliberately weighted more heavily: a peak is where the community is both busy and reachable, not merely loud. |
| **Peak Activity panel** | The top day/time windows by peak score, ranked by that combined score — never by message volume alone. | Each row shows the day, time range, average active members, average messages, and a relative activity indicator versus the window-wide hourly baseline. |
| **Relative activity indicator** | Peak window's mean cell score ÷ the window-wide baseline score (baseline = the same weighted formula over the window's average active member and message counts). | Displayed as e.g. "2.3× hourly avg.". Uses identical data and observation period as the heatmap. |
| **Peak Consistency** | Number of observed weeks in which the window was meaningfully above its weekly baseline ÷ number of observed weeks. | Displayed as e.g. "4/4 weeks". Only available when two or more weeks are observed. |

Peak detection should use a robust baseline so one unusually large event or viral thread does not define a normal peak. The exact statistical method can be calibrated during implementation.

If fewer than two weeks are available, do not show a week-consistency claim. Do not invent missing weeks.

## 8. Most active channels

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Channel Messages** | Total member-generated messages in a channel during the selected period. | Primary ranking metric. |
| **Channel Active Members** | Unique members who participated in a channel during the selected period. | Supporting context. |

Preferred UI label: **Most active channels**. Rank by message volume.

## 9. Activity tier distribution

Members are assigned one canonical activity tier using a trailing 28-day window. Bots are excluded. Tiers are relative to the community rather than fixed message-count cutoffs.

| Tier | Definition | Notes |
| --- | --- | --- |
| **Superuser** | Top ~5% of active members by Activity Score, subject to a minimum meaningful-activity floor. | Floor: 5+ active days in the window. Not forced to exactly 5% if the community lacks enough meaningful activity. |
| **Contributor** | Next ~15% of active members by Activity Score, subject to the same floor. | Relative ranking plus the 5+ active-day floor; short bursts fall to Lurker. |
| **Regular** | Remaining active members who demonstrate recurring participation. | Meaningfully recurring activity below Contributor. |
| **Lurker** | Members with detectable participation but insufficient activity to qualify as Regular. | Evidence of presence, but very low activity. |
| **Inactive** | Members with no qualifying activity during the 28-day window. | No message, reaction, or voice participation. |

**The tier distribution does not respond to the date range.** It is the one
Engagement card that is deliberately period-independent: the tier engine is
anchored to the window end and always measures the trailing 28 days, so
selecting 7/14/28/84 days (or a custom range) leaves this card unchanged. This
is required, not a bug — the tier is the *shared canonical member attribute*
rendered on Engagement, People, member profiles, the member popup, saved
segments, and as the Influence Score window on Relationships. Making this card
respond to the picker would let the same member show two different tiers
depending on which page they are viewed from.

To keep the behaviour legible, the card title carries a **Trailing 28 days**
caption stating the window in use. Period-based metrics elsewhere on the page
(Active Members, Messages, rates, charts, channels, discussions) all follow the
date range as normal.

> **Implementation:** `dashboardWindow` counts tiers via `activityTiers(end)`,
> which hardcodes `cutoff = end - 28d`. The chosen range never reaches the tier
> engine. Note that because Superuser and Contributor are cut as percentiles of
> *active* members, their shares are stable even if the window were re-scoped;
> only Regular/Lurker/Inactive absorb the change, and a 7-day re-scope would
> leave the card ~85% Inactive.

## 10. Activity Score

The Activity Score ranks members within the community before assigning tiers. It rewards consistent, broad participation rather than one-off message volume.

| Signal | Definition / calculation | Weight / notes |
| --- | --- | --- |
| **Active Days** | Number of distinct days in the trailing 28-day window on which the member performed qualifying activity (a sent message, a sent reaction, or voice participation). | 50% of Activity Score. |
| **Messages** | Member-generated messages during the trailing 28-day window. | 25%; normalize/log-scale so extreme volume does not dominate. |
| **Interactions** | Replies and reactions associated with the member's participation during the trailing 28-day window. | 15%; normalize/log-scale. |
| **Channel Breadth** | Number of distinct channels in which the member participated during the trailing 28-day window. | 10%; influences score, not a hard Superuser member gate. |

**Activity Score =**

`Normalized Active Days × 0.50 + Normalized Messages × 0.25 + Normalized Interactions × 0.15 + Normalized Channel Breadth × 0.10`

Voice participation contributes to Active Days. It is not converted into an arbitrary number of message equivalents.

## 11. Trending conversations

Trending Conversations remains on Engagement as content intelligence: what the community is talking about now, rather than which conversation has simply accumulated the most activity.

| Metric | Definition / calculation | Notes |
| --- | --- | --- |
| **Trending Conversation** | A conversation showing unusually high interaction velocity and acceleration compared with its recent activity baseline, subject to a minimum activity threshold. | Designed to avoid favoring older, already-large conversations. |
| **Interaction Velocity** | Current interaction rate based on replies, reactions, and unique participants. | Proposed weighting: Replies × 1.0 + Unique Participants × 1.0 + Reactions × 0.5. |
| **Velocity vs Baseline** | Current 3-hour interaction rate ÷ the conversation's previous 24-hour average 3-hour interaction rate. | 50% of proposed Trending Score. |
| **Acceleration** | Current 3-hour interaction rate ÷ interaction rate in the preceding 3-hour window. | 30% of proposed score. |
| **Participant Growth** | Unique participants in current 3-hour window ÷ unique participants in preceding 3-hour window. | 20% of proposed score. |
| **Trending Score** | Normalized combination of Velocity vs Baseline (50%), Acceleration (30%), and Participant Growth (20%). | Cap/normalize ratios to avoid tiny denominators creating extreme scores. |

Proposed guardrail: at least 10 meaningful interactions and 3 unique participants in the current 3-hour window. Validate exact thresholds and normalization against real Discord data before production.

## 12. Metric relationships and non-duplication rules

- Active Member Rate is the percentage form of Active Members.
- New Member Activation measures participation within 7 days of joining; it is not retention.
- 28-day Retention measures return activity among members active in the previous 28 days; it is not activation.
- Reaction Rate measures how many messages received at least one reaction. Reactions-per-message is intentionally excluded.
- Channel ranking is based on message volume; active members provide context.
- Activity Over Time follows the selected date range.
- Active members by day & time follows the selected date range and aggregates it into weekday/hour patterns; cell colors follow Active Members, while message volume is carried on the cell for the tooltip and peak scoring.
- Peak windows and the relative indicator share one normalized active-weighted score with the underlying heatmap data and observation period; they are interpretation layers attached to the heatmap, not standalone features.
- Voice participation counts toward Active Members and activity days, while voice-specific metrics expose voice usage separately.
