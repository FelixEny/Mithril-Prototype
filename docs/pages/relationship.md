# Mithril Analytics — Relationships

## Purpose

The Relationships page helps Community Managers understand the social structure of their community: who is connected, how strong those relationships are, where groups form, and which members connect or influence different parts of the community.

The page should explain the network without turning it into a wall of technical network-analysis metrics.

---

# 1. Core Concept: Meaningful Connection

A **meaningful connection** exists when two members have:

- At least **2 qualifying interactions**
- Across at least **2 different days**
- Within the selected period

### Qualifying interactions

- Replying to each other's messages
- Reacting to each other's messages

Simply being in the same channel or participating in the same conversation does not create a connection.

Each member-to-member relationship is counted once.

Bots are excluded from member-level relationship calculations.

---

# 2. Community Health

## Community Strength

**Definition**

Community Strength is a **0–100 score** representing the overall health of the community's social network.

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

The calculation is internal. **Connection Distribution** is the visible representation of this underlying pattern.

### Relationship Quality — 15%

Measures the overall strength of meaningful relationships across the community.

For the Community Strength calculation:

- Strong = 100
- Mid = 60
- Weak = 20

```text
Relationship Quality =
  Weighted average relationship strength
  across meaningful relationships
```

---

# 3. Connected Members

**Definition**

Members with **2 or more meaningful connections** during the selected period.

### Calculation

```text
Connected Members =
  Count of members with ≥ 2 meaningful connections
```

The UI can show both the count and percentage of total members.

---

# 4. Less Connected

**Definition**

Members with **0–1 meaningful connections** during the selected period.

### Calculation

```text
Less Connected =
  Count of members with 0–1 meaningful connections
```

This is the complement of Connected Members.

"Less Connected" describes network position. It does not mean that these members are inactive.

---

# 5. Average Connections per Member

**Definition**

The average number of meaningful member-to-member connections across the community.

### Calculation

```text
Avg. Connections per Member =
  Total meaningful connections ÷ Total members
```

Each relationship is counted once.

All members are included in the denominator, not only Connected Members.

---

# 6. Connection Distribution

**Definition**

Shows how members are distributed according to the number of meaningful connections they have.

### Community-size adaptation

The distribution must **adapt to community size**.

Fixed connection ranges should not be treated as universal rules because a connection count that is high in a small community may be ordinary in a much larger one.

The system should select sensible connection-count buckets based on the size and distribution of the community while preserving a clear first bucket for members with very few connections.

For the initial implementation, the default buckets can be:

- 0–1
- 2–9
- 10–49
- 50+

For larger or smaller communities, these ranges may be adjusted so the visualization remains meaningful and does not produce mostly empty or overloaded buckets.

The underlying metric remains the same:

```text
Connection Distribution =
  Count of members grouped by meaningful connection count
```

The displayed buckets are presentation parameters, not different definitions of a connection.

---

# 7. Clusters Detected

**Definition**

A cluster is a group of members with substantially more meaningful connections within the group than with members outside it.

### Parameter

Minimum cluster size:

```text
5 members
```

Groups smaller than 5 members should not be surfaced as community clusters.

The page reports the number of detected clusters.

**Cluster Size** and **Cluster Cohesion** are not exposed as separate metrics.

---

# 8. Bridge Members

**Definition**

A Bridge Member is a member whose meaningful relationships span **at least two distinct clusters**.

Bridge members connect otherwise separate parts of the community.

### Calculation rule

```text
Bridge Member =
  Member has meaningful relationships
  with members in ≥ 2 clusters
```

Bridge members should be identified directly on the normal relationship graph.

---

# 9. Individual Influence

## Reach

**Definition**

Reach is the number of **unique members who interact with a member's content** during the selected period.

Reach is different from Connections.

A member can have relatively few meaningful relationships but still reach many people through their messages.

### Calculation

```text
Reach =
  Count of unique members who interact with the member's content
```

---

## Influence Score

**Definition**

Influence Score is a **0–100 score** measuring an individual's influence over the **trailing 28 days** — the same window as the Activity level tier.

It answers a different question from Community Strength.

- Community Strength asks: **How healthy is the community's social network?**
- Influence Score asks: **How influential is this individual within that network?**

Influence is **pinned to the trailing 28 days from the data end**, independent
of the page's date-range picker, so the same member reads the same score on the
Relationships page, the People table and the member popup. It is computed by a
single shared engine (`relationships.influenceEngine()`, `INFLUENCE_DAYS = 28`); the
picker only shapes the graph itself (edges, clusters, strength, popup
connections/mix). Members with no qualifying network edges in the trailing 28
days fall back to a small activity-derived score (see `people.ts`).

### Calculation

```text
Influence Score =
  Reach × 0.40
+ Relationship Quality × 0.40
+ Activity × 0.20
```

Each component is normalized to 0–100 relative to the community.

### Components

**Reach — 40%**

How many unique members interact with the person's content.

**Relationship Quality — 40%**

How strong the member's meaningful relationships are.

**Activity — 20%**

How actively the member participates in the community.

### Component weights and definitions

`INFLUENCE_COMPONENTS` in `relationships.ts` is the single source of truth for the
weights. The score itself is computed via `influenceOf()`, which reads those same
weights, so the score and the member popup's breakdown can never drift apart.

**Reach and activity are normalised against the community maximum** (they are
expressed as a percentage of the most-reached / most active member), whereas
relationship quality is an absolute 0–100 average of the edge weights. This
caveat is documented here rather than surfaced in the popup, which carries no
explainer.

### Member popup

The member popup decomposes the score as a stacked bar plus one row per component,
read as `contribution / maximum` (e.g. `34 / 40`). The rows sum to the headline score.
When all three components are 0, the rows are replaced by a short empty-state note.

The popup spans the height of the graph's grey area (8px inset on top, right and
bottom). The header is pinned and the remaining content scrolls in `.mp-body`. Its
summary stats are **Activity level** (rendered with `TierPill`) and **Cluster**
(`Cluster {n}`, or `—` when the member is unclustered).

**Top connections** lists the three strongest relationships for the selected
member, ranked by `RelationshipEdge.score` with the member id as a deterministic
tiebreak. They are read from the same `data.edges` as the graph and the
Relationship mix bar directly above them, so all three agree for the visible
range. Each row shows the strength dot, avatar, name and explicit
Strong / Moderate / Weak label; with no edges the section shows a short
empty-state note.

> **Deviation from Figma:** the popup is **320px** wide, not the **280px** specified by
> node `896:53644` in file `leSvcL6Q3iSadrTYzarsy0`. The extra width accommodates the
> component breakdown. The stacked bar and the gapped relationship-mix segments
> (4px gap, 2px radius) follow the design; Figma has no component breakdown, so that
> part is net-new.

### Total links and selection

The graph's **Total links** metric is context-sensitive. With no member selected it
reports the community figure with its period-over-period `Change` and an explanatory
tooltip. While a member is selected it reports that member's own degree, labelled
`{name} — total links`, and both the `Change` and the tooltip are dropped because
they describe the community rather than the individual.

---

## Top Influencers

**Definition**

Members ranked from highest to lowest by Influence Score.

The widget can display the top 5–10 members.

---

# 10. Relationship Strength

**Definition**

Relationship Strength describes **how strongly two members are connected based on their interactions**.

It is a property of an individual relationship, not a measure of how many connections a member has.

For example, a member can have 100 connections without all 100 relationships being strong:

- 10 Strong
- 35 Mid
- 55 Weak

A relationship becomes stronger when members:

- Interact often
- Interact recently
- Interact consistently over time

### Calculation

```text
Relationship Strength =
  Frequency × 0.40
+ Recency × 0.30
+ Consistency × 0.30
```

Each component is normalized to 0–100.

### Frequency — 40%

Measures how often the two members have qualifying interactions.

A relative or logarithmic scale should be used rather than fixed raw interaction thresholds so the metric adapts to communities with different activity levels.

### Recency — 30%

Measures how recently the two members last interacted.

More recent interaction produces a higher score.

### Consistency — 30%

Measures whether the relationship appears repeatedly over time rather than being concentrated in one short burst.

Interactions spread across multiple weeks should score higher than the same number of interactions occurring on one day.

### Relationship labels

| Score | Relationship |
|---:|---|
| 70–100 | Strong |
| 40–69 | Mid |
| 0–39 | Weak |

"Weak" describes relationship intensity. It does not necessarily mean the relationship is declining.

---

# 11. Most Connected

**Definition**

Most Connected is a graph filter that identifies members with unusually high numbers of meaningful connections relative to the community.

### Recommended threshold

```text
Top 10% of members
by meaningful connection count
```

A percentile-based threshold is preferred over a fixed connection count so the filter scales across communities of different sizes.

---

# 12. Important Distinctions

These concepts should remain separate:

| Concept | Meaning |
|---|---|
| **Connections** | How many meaningful relationships a member has |
| **Reach** | How many unique members interact with that member's content |
| **Relationship Strength** | How strong one specific relationship is |
| **Influence Score** | Individual influence based on Reach, Relationship Quality, and Activity |
| **Community Strength** | Overall health of the community's social network |

---

# 13. Selected Period Rules

Unless otherwise stated, Relationships metrics use the date range selected by the user.

The same selected period should be applied consistently across the relationship metrics and graph.

Bots are excluded from member-level relationship calculations.

---

# 14. Implementation Notes

Metrics should be derived from a shared underlying relationship/event dataset rather than independently generated values.

This keeps:

- Graph relationships
- Connection counts
- Connection distribution
- Clusters
- Bridge members
- Relationship strength
- Influence rankings
- Community Strength

internally consistent.

The definitions and weighting in this document are product-level decisions.

Exact normalization curves for Frequency, Recency, Consistency, Reach, Activity, and the Distribution component should be calibrated against representative Discord data before production release.

Calibration should change how raw values are scaled, not what the metrics mean.
