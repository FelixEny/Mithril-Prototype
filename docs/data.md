# Mithril Mock Data

Use the files in this folder as the canonical synthetic Discord dataset for the Mithril prototype.

## Important implementation rule

Do NOT hardcode dashboard metric totals such as Active Members, Retention, Reply Rate, Community Strength, Activity Tiers, Trending Conversations, or Relationship counts.

Calculate displayed metrics from the underlying source data.

The same underlying members, messages, replies, reactions and voice sessions must power Overview, Engagement, People and Relationships.

## Source entities

- community.json
- members.json
- channels.json
- voice-channels.json
- roles.json
- messages.json
- replies.json
- reactions.json
- voice-sessions.json
- threads.json — discussion threads. `threadId` on a message references a thread by this id.

## Data generation

A deterministic generator (`scripts/generate-data.mjs`) produces and maintains these files.

- Run it with `node scripts/generate-data.mjs`.
- It is seeded and deterministic: rerunning it produces the same output unless the source files change.
- It fills product gaps in the hand-written seed data: six months of history (so every 7/14/28/84-day preset has a full prior period for deltas and retention), discussion threads (including ones with recent bursts so Trending can emerge), voice-only members, varied message/reply content, and realistic reaction timestamps.
- It also *retimes* the existing seed messages and voice sessions to a per-weekday activity model so on-screen hours look organic. A deterministic per-message-id pass reassigns each event to an hour sampled from its day's curve (weekday trough 12am–6am, ramp from 7am, midday dip 9am–5pm clearly below the evening, peak 6–10pm, taper into late night; each weekday has a distinct shape — its own peak hour, dip depth, and evening tail: Tue spikes early and drops fast, Thu plateaus broad and loud, Fri softens the dip and stays late; weekends ramp later, skip the workday dip, stay elevated through the afternoon, and peak earlier ~5–6pm with a fast taper; ±~10% hourly jitter plus rare outlier days). Only the hour changes — the calendar date never moves, so per-day metrics and activation/retention windows are untouched. The pass is idempotent (events already at their target hour are left alone), so re-runs are byte-stable. (One subtlety: content enrichment reads the pre-retime timestamp, so after a model change the corpus settles fully on the second run; steady-state re-runs are byte-identical.)
- Reaction timestamps are emitted as a true instant after their message (`toIsoAt` renders a `+01:00` string whose parsed value equals the intended instant), so a reaction never precedes the message it reacts to.
- The community timezone is Africa/Lagos (UTC+1 through the data window). The app barrel shifts raw timestamps +1h so UTC-based date helpers read the community's wall-clock hours.

Reported synthetic dataset properties:

- members: 2660 humans + 2 bots (2400 seeded + 240 mid-year cohort across May–Jul + 20 late-summer top-up joining Aug 11–24, which keeps the 14-day and 28-day New Members windows from reading identically)
- messages: ~117k across 2024-03-10 .. 2024-09-07
- threads: 14, referenced from messages via `threadId`
- member `roles` are role ids resolving against `roles.json` (15 roles: Core-Team, Moderator, Admin, Cohort-Mentor, Bounty-Hunter, Contributor, Ambassador, Degen, Member, Design, Builder, OG, Grantee, Hacker, Event-Host — each with a Discord-style `color` used for the role dots in the People filter menu); assigned deterministically by the generator in two layers. **Functional roles** (staff + specialty) are exclusive, so a member holds at most one; **badge roles** (Builder, Hacker, Grantee, Event-Host, OG) stack freely on top. Each badge is a seeded Bernoulli whose probability rises with a member's engagement (activity rank blended with tenure seniority), so badges cluster on the long-tenured active core and thin out toward the periphery; the most engaged members reach the full seven-role stack (one functional role + Member + five badges). Role order is a fixed display priority (leadership → specialty → badges → Member), so the single pill the People table shows is the member's most meaningful role and the rest collapse into the `+N` tooltip. ~5% of members are role-less, weighted toward low activity; bots are always role-less. Role-less members render `--` in the People table
- segments: 5 built-in saved filtered lists (`src/data/segments.json`) — dynamic segments store criteria (membership computed at render time by `src/segments.ts`), static segments store explicit `memberIds`
- member `displayName`s are unique and culturally coherent across the corpus: each member is allocated to one of 19 cultures in `scripts/name-data.mjs` (largest-remainder from culture weights — US/UK/Nigeria/India/Kenya/Ghana/Brazil/Mexico/South Africa/LatAm/Philippines/Vietnam/China/Japan/Korea/Indonesia/Germany/France/Italy), then given + surname are drawn from that culture's pools only ("Given Surname" ordering everywhere), sampled without replacement and assigned by member id
- member `username`s (the `@handle`) are derived deterministically from that culture-scoped display name, so every handle traces to its own visible name ("Adaeze Obi" → `@adaeze.obi`, never a leftover seed handle). Handles read as realistic community handles: a mix of clean `given.surname`, numbered `given.surname27`, underscore `given_surname`, initial `a.obi`, and a ~33% goofier share kept name-anchored (`xxadaeze`, `therealadaeze`, `adaeze_lol`). Staff/admins (`role_001`/`role_003`) keep clean `given.surname` handles for easy @-recognition; styles + any digits are sampled deterministically via seeded picks on fixed tags, and a global dedupe appends a deterministic numeric suffix on slug collision before uniqueness is asserted the same way names are
- the dataset is internally consistent (every `authorId`/`memberId`/`channelId`/`threadId` resolves)

## Analytics rules

Bots are excluded.

Active Member = member with at least one qualifying activity in the selected period:
- sent a message
- added a reaction
- participated in voice

Messages = member-generated messages. Replies are messages and are already represented through the reply records attached to messages; do not count a reply twice.

Reply Rate = messages receiving at least one reply / all member-generated messages.

Reaction Rate = messages receiving at least one reaction / all member-generated messages.

Voice Participants = unique members participating in voice.

Total Voice Time = total elapsed voice-session time.

Voice-only Participant = member whose only qualifying activity in the selected period was voice.

Activity tiers use a trailing 28-day window:
- Superuser
- Contributor
- Regular
- Lurker
- Inactive

Activity Score:
- Active Days: 50%
- Messages: 25%
- Interactions (replies + reactions): 15%
- Channel Breadth: 10%

Superuser is approximately the top 5% of active members, subject to a meaningful-activity floor. Contributor is the next approximately 15%, subject to the same floor. The floor requires 5+ active days in the window: a short burst can outscore most actives on volume, but without sustained presence it tiers as Lurker, not Superuser/Contributor. Regular is recurring active participation. Lurker has detectable but insufficient activity. Inactive has no qualifying activity.

Meaningful relationship:
- At least 2 interactions between two members
- Interactions occur on at least 2 different days within the selected period

Connected Members = members with at least 2 meaningful connections.

Community Strength:
- Connectedness 35%
- Participation 30%
- Distribution 20%
- Relationship Quality 15%

Trending conversations should be calculated from interaction velocity, velocity vs recent baseline, acceleration, and participant growth. Do not manually assign a conversation as trending.

## Data behavior

The dataset intentionally contains different member behaviors, channel personalities, recurring activity patterns, bursts of conversation, and voice participation. Preserve those relationships when building the UI.

The UI should make the data feel like a real Discord community, not a collection of unrelated sample numbers.

## Verification

Reference cardinality from a fresh `node scripts/generate-data.mjs` run:

- messages: 116678 (881 authors)
- replies: 55443
- reactions: 127412
- voiceSessions: 6554 (639 unique members; 36 voice-only)
- threads: 14 (17861 messages in threads)
- date range: 2024-03-10 .. 2024-09-07

After any generator change, assert the following. (If the activity model changed, run once, then a second time — the corpus settles fully on the second run — then run the checks against that output.)

1. Determinism / byte-stability: run the generator twice more and confirm every file in `src/data/` is byte-identical (compare file hashes).
2. Cardinality unchanged: the counts above match.
3. No reaction precedes its message: `Date.parse(reaction.timestamp) >= Date.parse(message.timestamp)` for every reaction.

### Relationship graph story

The relationships page derives its story from engine logic in `src/relationships.ts`; `scripts/verify-relationships.mjs` mirrors the scoring, clustering, and bridge detection so the story can be checked headlessly (keep its `STRONG_AT` / `MID_AT` / `FREQ_K` and the surfaced-cluster floor in sync). Run `node scripts/verify-relationships.mjs` (defaults to the two longest shipped presets, 28-day and 84-day) and expect:

- 28-day window: exactly the 5 latent communities as surfaced clusters, no stray clusters, **9 bridge members**, label mix 40% strong / 56% mid / 4% weak (weak edges are rare by design — pairs interact at least twice on two days to qualify).
- 84-day window: the same 5 clean clusters, **38 bridge members**, label mix 34% strong / 60% mid / 7%. The bridge roster grows sharply with the window because the graph more than doubles in density (5.1k links at 28 days, 11k at 84 days) and cross-community pairs clear the two-days/two-interactions bar far more often; treat 38 as the expected ceiling, not a regression.
- Bridge definition: a member whose qualifying edges reach **two surfaced clusters other than their own**.
- The generator's "bridge story pass" (`bridge:rel:` seeds) attaches deterministic cross-community reactions so the designated bridge roster reliably reaches two other communities inside any 30-day window.
