# Craft & Animation Pass

Status: **Deferred** — work on this after all pages are built. Scope, timings, and
details captured here may be tuned when implemented.

## Current animation state (baseline)

- Heatmap cells: hover `transform` scale + outline (`.cells button`, `styles.css`)
- Donut: hover opacity fade on sectors (`.donut .recharts-pie-sector`, `styles.css`)
- Legend items: hover `opacity` + `.active .label` (seed state exists)
- Stats render plain strings — no count-up
- Everything else snaps: nav buttons, channel rows, tabs, tooltips, cards, peak overlays
- Recharts defaults drive the only ambient motion (mount draw-ins)
- No `prefers-reduced-motion` handling

## Decisions (confirmed with user)

- Scope: **Tiers 1–3** (micro-interactions, count-ups, entrance choreography)
- Count-ups run **on load only** — range changes update numbers instantly
- Tier 4 items are optional / deferred
- Do this pass **after all pages are built**

## Tier 1 — Micro-interactions (pure CSS)

- `src/styles.css` base rules: add
  `transition: background-color .16s ease, color .16s ease` to
  `nav button`, `.side-bottom button`, `.community-switch-inner`, `.channel-row`,
  `.upgrade`, `.view`
- `src/tokens.css` rule owners: `.tabs button` (transition bg/color/box-shadow —
  pill + selected), `.discussion` (background-color)

## Tier 2 — Count-up on load

- New `src/hooks/useCountUp.ts`: `useCountUp(to, fmt)` animates `0 → to` once on
  mount (~700ms, `easeOutCubic`, `requestAnimationFrame`), returns formatted string;
  no new dependencies
- `src/components/Stat.tsx`: optional `count?: number` + `format?: (n) => string`;
  use the animated value when present, otherwise the existing `value` string
- `src/App.tsx` call sites: 4 core KPIs, 4 engagement-depth metrics, donut center
  total — reuse `formatNumber` / `formatPercent` (percentages animate `raw*100`
  so the final tick matches current display)

## Tier 3 — Entrance choreography

- `src/styles.css`:
  - `@keyframes card-in` (opacity 0, translateY 8px → 1/0) on `.card` with
    `animation: card-in .45s ease-out backwards` + staggered `nth-child` delays:
    core-grid 0–180ms, two-grid 220/280ms, metrics 320ms, heat 380ms, bottom-grid
    440/500ms. Runs once per mount; range changes do not remount, so no replay.
  - `@keyframes tooltip-in` (opacity 0 / translateY 2px → 1/0)
  - `@keyframes overlay-in` (scale .8→1 + fade) for `.peak-overlay`
- `src/tokens.css`: `.chart-tooltip { animation: tooltip-in .14s ease-out }`,
  `.heat-tooltip { animation: tooltip-in .12s ease-out }`,
  `.peak-overlay { animation: overlay-in .18s ease-out }`
- `src/App.tsx`: `<Line ... animationDuration={800} animationEasing="ease-out"/>`

## Tier 4 — Optional / deferred

- Donut spring-in tuning; heatmap cell color transition on range change;
  legend↔slice click/hover sync (leverage existing `.active` seed)

## Cross-cutting

- `@media (prefers-reduced-motion: reduce)` reset in `styles.css`: collapse
  animation/transition durations and iteration counts globally

## Verification

- `npm run build`; assert keyframes + transitions in the bundle; confirm live on
  `:5173`
- Spot-check: subtle hovers, KPIs count up once on hard refresh, cards stagger in,
  tooltips rise, peak overlays pop in, charts draw smoothly