# Mithril Design System

## Purpose

This document defines the design rules and tokens for the Mithril prototype.

Mithril is a prototype, not production software. The goal is to reproduce the intended Figma designs consistently while using the design token system in code.

## Design Source of Truth

Figma is the visual guide for the prototype.

Use Figma to understand:
- Layout and structure
- Visual hierarchy
- Component appearance
- Proportions and relationships
- Intended spacing and sizing
- Overall visual direction

Figma does not need to explicitly map every value to a token. When a value in Figma matches an existing token, map it to that token in code.

The design tokens are the implementation system. Figma is the visual reference.

---

# Design Tokens

## Color

### Option Tokens

#### Grey
- 900: `#111928`
- 800: `#1F2A37`
- 700: `#374151`
- 600: `#4B5563`
- 500: `#6B7280`
- 400: `#8E96A4`
- 300: `#C6CBD2`
- 200: `#ECEDEE`
- 100: `#F0F2F4`
- 50: `#F9F9F9`
- 0: `#FFFFFF`

#### Yellow
- 400: `#794100`
- 300: `#B66E00`
- 200: `#FDAB00`
- 100: `#FFCC00`
- 50: `#FEF5C6`

#### Red
- 400: `#5E0808`
- 300: `#B80000`
- 200: `#FF3838`
- 100: `#E89292`
- 50: `#F2E9E9`

#### Brand
- 400: `#2A1962`
- 300: `#3F2592`
- 200: `#693CF3`
- 100: `#B9A8FA`
- 50: `#EFEDFF`

#### Green
- 400: `#01371F`
- 300: `#027943`
- 200: `#009A47`
- 100: `#68FDB2`
- 50: `#E7FDF3`

#### Alpha
- Grey 900 at 8%: `rgba(17, 25, 40, 0.08)`

#### Special
- Purple: `#693CF3`
- Green: `#42BB00`
- Blue: `#008EFF`
- Yellow: `#FDAB00`
- Grayish Green: `#3CAA9F`

#### Avatar palette (`--avatar-1..6`)
System colors used for avatar tinting (initials circles, graph nodes, Dicebear background): Brand Purple `#693CF3`, Green/200 `#009A47`, Blue `#008EFF`, Yellow `#FDAB00`, Grayish Green `#3CAA9F`, Red `#E5484D`. Assigned deterministically per member; single source of truth is `src/avatars.ts`.

### Semantic Tokens

#### Content
- Primary: `Color/Grey/900`
- Secondary: `Color/Grey/500`
- Tertiary: `Color/Grey/400`
- Brand: `Color/Brand/200`
- Positive: `Color/Green/200`
- Negative: `Color/Red/200`
- Neutral: `Color/Grey/0`
- Yellow: `Color/Yellow/300`

#### Surface
- Primary: `Color/Grey/0`
- Secondary: `Color/Grey/50`
- Tertiary: `Color/Grey/100`
- BrandLight: `Color/Brand/50`
- Brand: `Color/Brand/200`
- Dark: `Color/Grey/900`
- Yellow: `Color/Yellow/100`

#### Border
- Primary: `Color/Grey/200`
- Modal: `Color/Alpha/Grey 900 (8%)`

#### Chart
- Superuser: `Color/Special/Purple`
- Contributor: `Color/Special/Green`
- Regular: `Color/Special/Blue`
- Lurkers: `Color/Special/Yellow`
- Inactive: `Color/Grey/300`
- Brand: `Color/Brand/200`
- BrandMid: `Color/Brand/100`
- BrandLight: `Color/Brand/50`

#### Heatmap (activity grid)
- 1: `#CFFCE4`
- 2: `#9BE6BE`
- 3: `#7CD7A6`
- 4: `#5DC88F`
- 5: `#3EB877`
- 6: `#20A860`
- 7: `#017A39`
- scale-1 (legend start): `#BAF7CF`
- Intensity thresholds (messages per week per weekday/hour cell — `heatLevel()` in `src/analytics.ts`):
  - 1: ≤ 6
  - 2: ≤ 15
  - 3: ≤ 30
  - 4: ≤ 50
  - 5: ≤ 80
  - 6: ≤ 130
  - 7: > 130
- Each weekday row is normalized by its own occurrence count in the selected window (not a uniform days/7), so partial weeks and custom ranges don't inflate some weekdays over others.
- Active-members tab uses the same 7-step scale with member-count bounds (`heatActiveLevel()`): 1: ≤ 8, 2: ≤ 20, 3: ≤ 40, 4: ≤ 70, 5: ≤ 105, 6: ≤ 145, 7: > 145 (average unique active members per cell). Peak-window annotations appear on the Messages tab only.

#### Tooltip (chart)
- Background: `Color/Grey/900` (`#111928`)
- Label: `Color/Grey/300` (`#C6CBD2`)
- Value: `Color/Grey/0` (`#FFFFFF`)

## Corner Radius

Corner radii are hardcoded pixel values per the Figma design (prototype decision — radius tokens removed).

Reference values used across the UI:
- 2px — hairline details
- 4px — square icons, small pills
- 6px — date control, tabs active pill (inner radius), peak overlays
- 8px — tabs container (outer radius), tag pill, chart tooltips
- 12px — cards and card-like surfaces

## Spacing

### Option Tokens
- 0: `0px`
- 2: `2px`
- 4: `4px`
- 8: `8px`
- 12: `12px`
- 16: `16px`
- 20: `20px`
- 24: `24px`
- 32: `32px`

### Semantic Tokens
- none: `0px`
- 2xs: `2px`
- xs: `4px`
- sm: `8px`
- md: `12px`
- lg: `16px`
- xl: `20px`
- 2xl: `24px`
- 3xl: `32px`

# Typography

## Typeface

- Geist

LH = Line Height; LS = Letter Spacing.

## Token model

Typography is expressed as four independent token groups in `src/tokens.css`:

- `--font-size-<size>` — the size. Seven steps: `10`, `12`, `14`, `16`, `24`, `28`, `36`.
- `--font-weight-<weight>` — the weight. Four variants: `regular` (400), `medium` (500), `semibold` (600), `bold` (700).
- `--line-height-<size>` — one line height per size, **shared by every weight at that size**.
- `--letter-spacing-<size>` — one letter spacing per size, **shared by every weight at that size**.

Weight tokens are deliberately size-independent. That is what gives every size all
four weight variants without a 7 × 4 matrix, and it makes the "all weights at a
size share LH and LS" rule structural rather than a convention someone has to
remember. A rule therefore reads:

```css
font-size: var(--font-size-24);
font-weight: var(--font-weight-semibold);
line-height: var(--line-height-24);
letter-spacing: var(--letter-spacing-24);
```

Never reference a raw `font-weight`, `line-height` or `letter-spacing` value.

`--letter-spacing-default` (-0.01em) is set on `:root` as the inherited fallback
for text that declares no size of its own. It is not a scale step.

Tracking rule: sizes ≤ 16px use LS −1% (−0.01em); sizes above 16px use LS −2% (−0.02em).

## Sizes

| Size | Tokens | Step |
| --- | --- | --- |
| 10px | `--line-height-10`, `--letter-spacing-10` | `xs-micro` — chart hour labels only |
| 12px | `--line-height-12`, `--letter-spacing-12` | `xs` |
| 14px | `--line-height-14`, `--letter-spacing-14` | `sm` |
| 16px | `--line-height-16`, `--letter-spacing-16` | `md` / card `title` |
| 24px | `--line-height-24`, `--letter-spacing-24` | `Heading/sm`, stat values |
| 28px | `--line-height-28`, `--letter-spacing-28` | `Heading/lg`, page titles |
| 36px | `--line-height-36`, `--letter-spacing-36` | lead story (`.lead-story`) |

### The one exception: 16px

16px is the only size carrying two line heights, because Figma defines two steps
at that size and the design keeps both:

- `--line-height-16` (1.3 / 130%) — `Body/md`
- `--line-height-16-title` (1.25) — `Heading/title`, the card title

Both are declared where used; the generic `h3` rule takes `--line-height-16-title`.

### Weight variants in practice

Most steps use a single weight, but every size may carry any of the four:

- 10px Regular · 12px Regular/Medium/Semibold · 14px Regular/Medium/Semibold
- 16px Medium/Semibold · 24px Medium/Semibold · 28px Semibold/Bold · 36px Medium/Semibold

Two deliberate departures from a plain Semibold-heading reading:

- The **Overview greeting** is 24px at `--font-weight-medium` in
  `--content-secondary`, not Semibold in `--content-primary`, which reads as a
  greeting rather than a page title. It is carried by
  `.page-title.greeting-title h1` rather than a new scale step.
- The **Overview lead story** is 36px at `--font-weight-medium`, with Semibold
  reserved for its `<strong>` figure runs — Medium for the connective grammar,
  Semibold for the numbers the sentence is holding up. Its `max-width` is `56ch`,
  which is the content column itself rather than a typographic limit: `main` caps
  at `1440px`, minus its `250px` sidebar margin and `48px`/`24px` padding, leaves
  `1368px`, and `1ch` resolves to `24.228px` at 36px Geist Medium with
  `--letter-spacing-36` applied — `56ch` = `1357px`, 11px inside the column.
  Raising it past `56ch` changes nothing at any viewport, because the parent
  stops it first.

  The measure is a ceiling the copy never reaches, not a lever on line length.
  Measured live, the single-clause story is `932px` of ink and the two-clause one
  `1606px` against a `1357px` box, so the short form is one line at *any* measure
  from `40ch` up, and the long form needs `66ch` to become one line — past the
  ceiling, so it stays two. `text-wrap: balance` then holds the long form's two
  lines near-equal at roughly `798px` each regardless of the measure. Widening the
  box therefore changes no line break and no ink width; it only stops the rule from
  describing a narrower column than the one it sits in. Below a `1533px` viewport
  the parent is already under `1211px` and the value does not bind at all.
- `.bench h2` (BenchmarkPage) is 28px **Bold** — the only Bold text in the app.

### Historical note

`--tracking-tight` (-0.01em) and `--tracking-tighter` (-0.02em) were replaced by
the per-size `--letter-spacing-*` tokens. `--font-size-11`, `--font-size-13` and
`--font-size-xl` were referenced but never defined, so those rules silently
inherited their font size; they now use `--font-size-12` and `--font-size-28`.

# Avatar Initials

Avatar initials are a single uppercase character on a tinted disc, drawn in `--font-family` at `--font-weight-semibold` in `--surface-primary`. They are **not** a step of the type scale and carry no `--font-size-*` or `--line-height-*` token: the glyph is sized from the disc it sits in, so it reads identically at 8px and at 88px. `.avatar` therefore keeps a raw `line-height:1`, which is intentional — every other raw typography value is a bug.

- **Scale**: `avatarInitialSize(discDiameterPx)` in `src/avatars.ts` is the single source of truth, consumed by both the DOM `Avatar` component and the graph's baked avatar atlas. Its anchors are (disc, glyph) pairs — 8/4, 20/9, 32/13, 52/20, 88/34 — interpolated in between. The glyph/disc ratio eases from ~0.50 at 8px to ~0.39 at 88px, because a tiny disc needs a relatively larger glyph to stay legible while a large one needs a relatively smaller glyph to stay balanced. Do not reintroduce a fixed percentage of the disc.
- **Optics**: the glyph is centred on its **measured ink box**, not its em box — a single character's ink is narrower and taller than its em box, so `text-align`/`vertical-align` centering leaves it visibly off-centre. Plain capitals measure 17px of cap in the graph's 62px sampled disc (27%); descender glyphs such as `Q` reach ~35%. A further lift of `--avatar-initial-optical-lift` (0.0146em) compensates for a glyph reading slightly low in a circle; the token is em-relative so the DOM and the canvas bake convert it identically.
- **Graph**: the atlas holds one cell per avatar key, so one baked glyph serves every node size and the proportion is constant across the graph's 8–52px range by design — including dimmed nodes, whose initials were previously large enough to fill the disc and read as a white blob. Per-size cells would need size-bucketed keys and are capped at three buckets by the atlas page budget. The bake must be given the cell's **sampled** diameter (`CONTENT / 2`), not the full cell: the node shader's UV ray is twice the disc radius, so only the cell's central half is visible on screen. Feeding the full cell width renders every initial at roughly twice its intended size.
- **Font readiness**: initials are centred from font metrics, so they bake and measure against real `Geist` outlines. `App` awaits `document.fonts.load('600 36px Geist')` before any screen renders — a load probe for the Semibold face, so the size only needs to be a real step on the scale.

# Shadows

Elevation model: resting (in-flow) surfaces never cast shadows. Cards, panels, inputs, buttons, tabs, and table wrappers are separated by opaque hairline strokes (`--border-primary`) or canvas contrast only. Shadows are reserved for detached/floating surfaces (menus, popovers, dialogs, tooltips, floating bars) and for a spread halo that marks an active/focused input.

Stroke↔shadow split: flat components use `border: 1px solid var(--border-primary)` (opaque). White floating surfaces (`.menu`, `.dc-popover`, `.seg-dialog`, `.member-popup`, `.graph-zoom`) render their hairline as an outside ring — `box-shadow: 0 0 0 1px var(--border-modal), <overlay shadow>` — so the `--border-modal` (8% alpha) stroke sits outside the box instead of shrinking it. Dark floating surfaces (tooltips, `--seg-bar`) are shadow-only, no stroke.

- `shadow-overlay`: `0 2px 6px -2px rgba(17, 25, 40, 0.10), 0 16px 32px -8px rgba(17, 25, 40, 0.12)` — menus, dropdown popovers, dialogs, tooltips, zoom cluster, date-picker popover. Two-layer contact + ambient.
- `shadow-overlay-strong`: `0 6px 16px -6px rgba(17, 25, 40, 0.12), 0 24px 48px -12px rgba(17, 25, 40, 0.18)` — the large floating segment actions bar and the member popup.
- `ring`: `0 0 0 3px rgba(17, 25, 40, 0.08)` — spread halo shown while an input or trigger is focused/active (`.date-control:focus-within`, `.people-search:focus-within`, `.seg-input:focus`, `.pp-stepper input:focus`, `.graph-select:focus-within>button`, `.people-select:focus-within>button`, `.seg-select:focus-within .seg-select-btn`, `.graph-search:focus-within`, `.graph-filter-btn:focus-visible`, `.graph-filter-btn[aria-expanded="true"]`). Typing inputs pair the halo with a brand stroke on focus (`border-color: var(--content-brand)`).

# Token Usage Rules

1. Use the existing design token system whenever a matching token exists.
2. When a value in Figma exactly matches an existing token, use that token in code even if the Figma layer or property is not explicitly mapped to the token.
3. Prefer semantic tokens when the design calls for a semantic role. Use option tokens when a direct option value is needed or when no appropriate semantic token exists.
4. Do not replace an existing token with an arbitrary value that represents the same value.
5. Apply this rule to colors, spacing, typography, and shadows. Exception: corner radius is not tokenized (see Corner Radius).
6. The fact that a value is not mapped to a token in Figma does not mean it should be hard-coded in code.

Example:
- Figma shows a 12px gap → use the 12px spacing token (`Spacing/md`), even if the Figma gap is not explicitly tokenized.
- Figma shows a 6px radius → hardcode `6px` (corner radii are raw pixel values).
- Figma shows `#693CF3` → use `Color/Brand/200`.

# Component Rules

1. Reuse existing components and patterns whenever possible.
2. Extend an existing component before creating a new component when the new use case is substantially similar.
3. Do not create separate components simply because their content or state differs.
4. Keep component behavior and visual treatment consistent with the existing Mithril design.
5. Use the existing token system when styling components.
6. A new component is appropriate when an existing component cannot reasonably support the new use case without becoming unclear or overly complex.

# Component States

1. Components should have sensible interactive states where appropriate.
2. Figma does not need to define every state.
3. When a state is not shown in Figma, create a reasonable state using the existing design tokens and visual language.
4. Do not create a new color, spacing value, radius, shadow, or other design value just to represent a component state.
5. Common states may include: Default, Hover, Focus, Active, Disabled, Loading, Error.
6. Only implement states that make sense for the component.

# Figma Fidelity

1. Use Figma as the visual reference when implementing screens.
2. Match the intended layout, hierarchy, proportions, spacing relationships, component appearance, and visual direction.
3. Do not blindly apply generic UI conventions when they conflict with the Figma design.
4. Figma is a guide, not a requirement that every property must be explicitly tokenized.
5. When the Figma design uses a value that exists in the token system, map it to the corresponding token in code.
6. When the Figma design contains a value that is not covered by the token system, use reasonable judgment to reproduce the intended design rather than forcing an incorrect token.

# Don't Invent Design

1. Do not invent new visual patterns when an existing Mithril pattern can solve the problem.
2. Do not introduce new colors, typography sizes, spacing values, radii, shadows, or component patterns when an existing token or pattern can represent the intended design.
3. Do not create a new design system alongside the existing Mithril system.
4. When a design decision is not explicitly defined, prefer the closest existing Mithril pattern and token.
5. If the existing system genuinely cannot represent the intended design, make the smallest reasonable implementation decision needed to reproduce the Figma design.
6. Keep the prototype visually consistent with the existing system.

## Recorded Exceptions

Where a screen matched Figma but the design system did not, the decision is recorded
here so the next pass does not "fix" it back.

- **Overview → Community insights card.** Figma nests a white panel inside a grey
  (`--surface-secondary`) card, inset by `--space-xs` with the same padding and an 8px
  radius. This is the one card on the page that does not use the flat
  `--surface-primary` treatment. Implemented as `.insights-card` +
  `.insights-panel`; keep the nesting if the card is revisited, and keep
  `CardTitle` in its standard position above the panel rather than inside it.
