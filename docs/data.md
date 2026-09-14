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
- It fills product gaps in the hand-written seed data: six months of history (so every 7/14/30/90-day preset has a full prior period for deltas and retention), discussion threads (including ones with recent bursts so Trending can emerge), voice-only members, varied message/reply content, and realistic reaction timestamps.
- It also *retimes* the existing seed messages and voice sessions to a per-weekday activity model so on-screen hours look organic. A deterministic per-message-id pass reassigns each event to an hour sampled from its day's curve (weekday trough 12am–6am, ramp from 7am, midday dip 9am–5pm clearly below the evening, peak 6–10pm, taper into late night; each weekday has a distinct shape — its own peak hour, dip depth, and evening tail: Tue spikes early and drops fast, Thu plateaus broad and loud, Fri softens the dip and stays late; weekends ramp later, skip the workday dip, stay elevated through the afternoon, and peak earlier ~5–6pm with a fast taper; ±~10% hourly jitter plus rare outlier days). Only the hour changes — the calendar date never moves, so per-day metrics and activation/retention windows are untouched. The pass is idempotent (events already at their target hour are left alone), so re-runs are byte-stable. (One subtlety: content enrichment reads the pre-retime timestamp, so after a model change the corpus settles fully on the second run; steady-state re-runs are byte-identical.)
- Reaction timestamps are emitted as a true instant after their message (`toIsoAt` renders a `+01:00` string whose parsed value equals the intended instant), so a reaction never precedes the message it reacts to.
- The community timezone is Africa/Lagos (UTC+1 through the data window). The app barrel shifts raw timestamps +1h so UTC-based date helpers read the community's wall-clock hours.

Reported synthetic dataset properties:

- members: 2400 humans + 2 bots
- messages: ~119k across 2024-03-05 .. 2024-09-07
- threads: 14, referenced from messages via `threadId`
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

Superuser is approximately the top 5% of active members, subject to a meaningful-activity floor. Contributor is the next approximately 15%. Regular is recurring active participation. Lurker has detectable but insufficient activity. Inactive has no qualifying activity.

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

- messages: 119281 (~1350 authors)
- replies: 56645
- reactions: 130307
- voiceSessions: 9049 (~1254 unique members; 36 voice-only)
- threads: 14 (18587 messages in threads)
- date range: 2024-03-05 .. 2024-09-07

After any generator change, assert the following. (If the activity model changed, run once, then a second time — the corpus settles fully on the second run — then run the checks against that output.)

1. Determinism / byte-stability: run the generator twice more and confirm every file in `src/data/` is byte-identical (compare file hashes).
2. Cardinality unchanged: the counts above match.
3. No reaction precedes its message: `Date.parse(reaction.timestamp) >= Date.parse(message.timestamp)` for every reaction.

### Relationship graph story

The relationships page derives its story from engine logic in `src/relationships.ts`; `scripts/verify-relationships.mjs` mirrors the scoring, clustering, and bridge detection so the story can be checked headlessly (keep its `STRONG_AT` / `MID_AT` / `FREQ_K` and the surfaced-cluster floor in sync). Run `node scripts/verify-relationships.mjs` (defaults to 30-day and 90-day windows) and expect:

- 30-day window: exactly the 5 latent communities as surfaced clusters (each 60+ members), no stray clusters, **6–14 bridge members**, label mix roughly 33% strong / 63% mid / 4% weak (weak edges are rare by design — pairs interact at least twice on two days to qualify).
- 90-day window: the same 5 clean clusters, **6–15 bridge members**, label mix near 20% strong / 73% mid / 7% weak.
- Bridge definition: a member whose qualifying edges reach **two surfaced clusters other than their own**.
- The generator's "bridge story pass" (`bridge:rel:` seeds) attaches deterministic cross-community reactions so the designated bridge roster reliably reaches two other communities inside any 30-day window.
