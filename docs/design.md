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

Tracking rule: sizes ≤ 16px use LS −1% (−0.01em); sizes above 16px use LS −2% (−0.02em).

## Heading

### lg (page title)
- Weight: Semibold
- Size: 28px
- Line height: 120%
- Letter spacing: -2%

### sm
- Weight: Semibold
- Size: 24px
- Line height: 120%
- Letter spacing: 0%

### title (card title)
- Weight: Semibold
- Size: 16px
- Line height: 125%
- Letter spacing: -1%

## Body

### md
- Weight: Medium
- Size: 16px
- Line height: 130%
- Letter spacing: -1%

### sm
- Weight: Regular, Medium, or Semibold
- Size: 14px
- Line height: 140%
- Letter spacing: -1%

### xs
- Weight: Regular
- Size: 12px
- Line height: 130%
- Letter spacing: -1%

### xs-micro
- Weight: Regular
- Size: 10px
- Letter spacing: -1%
- Note: micro labels only (chart hour labels, avatar initials). Line height inherits from context.

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
