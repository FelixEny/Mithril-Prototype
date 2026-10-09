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

#### Vendored avatar images
Image avatars are served locally so the prototype never depends on a third-party host at runtime: real face photos and Pravatar portraits live under `public/avatars/`, and DiceBear Adventurer portraits are vendored as 128px PNGs under `public/avatars/dicebear/` by `scripts/vendor-dicebear.mjs`. Attribution: **Adventurer** avatar style by Lisa Wischofsky, generated with DiceBear, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

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
- AreaFill: `#5926C8` (`--chart-area-fill`, gradient under the roster line; not in
  the documented palette — the value comes from the Figma gradient)
- Negative: `Color/Red/200` (`--chart-negative`, negative values such as left members)

#### Heatmap (activity grid)
- 1: `#F0F2F4`
- 2: `#D6F5E4`
- 3: `#9DE7BF`
- 4: `#64D89A`
- 5: `#31C476`
- 6: `#238B53`
- 7: `#145231`
- Legend swatches use the same tokens as the cells (swatch 1 = level 1), so the
  "Less activity" end of the legend matches the lightest cells in the grid.
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

Role tokens break the per-size tracking rule on purpose, the way weight tokens
break the one-weight-per-size assumption: `--letter-spacing-wordmark`
(−0.03em) for the Mithril wordmark, and `--letter-spacing-overline` (0.1em)
for wide-tracked uppercase eyebrow labels (currently the member-profile
`ACTIVITY` / `DISCORD ROLES` section labels). Prefer these over inventing a
raw value when a style needs tracking that isn't its size step.

## Sizes

| Size | Tokens | Step |
| --- | --- | --- |
| 10px | `--line-height-10`, `--letter-spacing-10` | `xs-micro` — chart hour labels and section overlines (overlines pair it with `--letter-spacing-overline`) |
| 12px | `--line-height-12`, `--letter-spacing-12` | `xs` |
| 14px | `--line-height-14`, `--letter-spacing-14` | `sm` |
| 16px | `--line-height-16`, `--letter-spacing-16` | `md` / card `title` |
| 24px | `--line-height-24`, `--letter-spacing-24` | `Heading/sm`, stat values |
| 28px | `--line-height-28`, `--letter-spacing-28` | `Heading/lg`, page titles |
| 40px | `--line-height-40`, `--letter-spacing-40` | lead story (`.lead-story`) |

### The one exception: 16px

16px is the only size carrying two line heights, because Figma defines two steps
at that size and the design keeps both:

- `--line-height-16` (1.3 / 130%) — `Body/md`
- `--line-height-16-title` (1.25) — `Heading/title`, the card title

Both are declared where used; the generic `h3` rule takes `--line-height-16-title`.

### Weight variants in practice

Most steps use a single weight, but every size may carry any of the four:

- 10px Regular · 12px Regular/Medium/Semibold · 14px Regular/Medium/Semibold
- 16px Medium/Semibold · 24px Medium/Semibold · 28px Semibold/Bold · 36px Medium/Semibold · 40px Medium

Two deliberate departures from a plain Semibold-heading reading:

- The **Overview greeting** is 24px at `--font-weight-medium` in
  `--content-secondary`, not Semibold in `--content-primary`, which reads as a
  greeting rather than a page title. It is carried by
  `.page-title.greeting-title h1` rather than a new scale step.
  - Its trailing glyph is a **vendored Fluent Emoji SVG** — `public/emoji/{sunrise,sun,cityscape-at-dusk,crescent-moon}.svg`, served at `/emoji/*.svg` and rendered as an `<img>`. It is deliberately *not* a Unicode codepoint: a codepoint is drawn by whichever emoji font the viewer's OS ships, so the greeting would be a different shape on Windows, macOS and Linux, and the balance tuned on one machine would not hold on another. The vendored set is MIT, is one set across all four bands, and is the same rounded-flat register as Phosphor. The four bands in `greeting()` return the file name rather than a codepoint.
  - The image box is `22px` — deliberately off the scale. The glyph is an ornament on the greeting rather than a member of it, so it is sized against the **cap height** it sits beside, not against the em box it would inherit: at 24px Geist Medium the cap measures 18px, and Fluent's artwork fills ~87% of its `32×32` viewBox, so a `22px` box puts ~19px of ink against that 18px cap. A raw `width`/`height` rather than a `--font-size-*` token, because this is an image dimension, not type — the same class of value as `.mpp-empty-icon`'s 40px. The `0.25em` gap before it scales with the wordmark's own size rather than with the type scale. `vertical-align: -2px` drops the box just below the text baseline: Fluent's artwork carries ~1.3px of bottom padding inside its viewBox, so a true-baseline box floats the ink ~1px above the baseline while overshooting the cap top by ~2.6px. The 2px drop centres the ~19px ink on the 18px cap (about 0.6px of overshoot each side) and grounds the glyph instead of floating it — an optical correction, so it stays a raw value paired with the 22px box.
    `greeting()` in `src/overview.ts` returns `{ text, emoji }` so the glyph is
    a separate node — `aria-hidden`, since the four bands are already stated in
    words. A wrapper with no size of its own would only inherit the 24px and
    change nothing.
- The **Overview lead story** is 40px at `--font-weight-medium`, with its
  load-bearing figure runs in `--content-primary` and the connective grammar in
  `--content-secondary` — the design's `{ts3}`/`{ts2}` records. The emphasis is
  colour at a single weight, not a second weight. Its `max-width` is `924px`,
  which is **Figma's lead-story text box** (`#963:55476`) taken verbatim — not a
  `ch` figure and not the content column. The measure binds at this size: at 40px
  Geist Medium `1ch` is `≈26.9px`, so the box is `≈34ch`, and even the single-clause
  story exceeds `924px` of ink, so every story wraps to two lines and
  `text-wrap: balance` holds them near-equal.

  The measure is a ceiling the copy always reaches, not a lever on line count:
  any candidate box narrower than the ink still yields two balanced lines, and
  widening `924px` does not make the long form a single line — the short form
  alone needs more than `924px` of ink at 40px. Break decisions come from the
  copy, not the box.
- `.bench h2` (BenchmarkPage) is 28px **Bold** — the only Bold text in the app.

### Historical note

`--tracking-tight` (-0.01em) and `--tracking-tighter` (-0.02em) were replaced by
the per-size `--letter-spacing-*` tokens. `--font-size-11`, `--font-size-13` and
`--font-size-xl` were referenced but never defined, so those rules silently
inherited their font size; they now use `--font-size-12` and `--font-size-28`.

# Avatar Initials

Avatar initials are a single uppercase character on a tinted disc, drawn in `--font-family` at `--font-weight-semibold` in `--surface-primary`. They are **not** a step of the type scale and carry no `--font-size-*` or `--line-height-*` token: the glyph is sized from the disc it sits in, so it reads identically at 8px and at 88px. `.avatar` therefore keeps a raw `line-height:1`, which is intentional. So does `.greeting-emoji`'s raw `22px` width/height (documented under the type scale above) — the two exceptions are dimensions that serve an object other than the type scale, a disc and a colour emoji respectively. Every other raw typography value is a bug.

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
- **Member profile → profile card.** The Figma "User Profile Card" carries a
  resting shadow even though elevation rules reserve shadows for floating
  surfaces. Implemented as `.card.mpp-profile` (doubled selector, so it beats
  the base `.card` ring declared later in the cascade in `tokens.css` — same
  trick as `.card.insights-card`) with the `--border-modal` outside ring +
  `--shadow-overlay`, matching the Figma stroke (`rgba(17,25,40,.08)`) and the
  documented ring+shadow pattern for shadow-carrying white surfaces; do not
  "fix" it back to a stroke-only card.
