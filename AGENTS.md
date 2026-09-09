# Mithril Analytics

Mithril Analytics is a community intelligence tool for Discord communities. It turns raw server activity into a clear picture of community health, engagement, and social structure.

Mithril helps Community Managers (CMs) understand not just how large their community is, but how active, engaged, and connected it actually is.

## Project Type

This is a **portfolio prototype**, not a production application.

Prioritize work in this order:

1. Visual fidelity
2. Product storytelling
3. Realistic interactions
4. Believable data

Do not spend time building production infrastructure or functionality that does not improve the portfolio experience.

## Prototype Scope

The following interactions should work:

- Hover interactions and states
- Chart interactions
- Dropdowns
- Filters
- Sorting
- Search
- Other interactions shown or implied by the Figma designs

Features that do not contribute meaningfully to the prototype experience do not need to be fully implemented.

## Prototype Data

This is a frontend prototype. There is no production backend.

Codex should generate and maintain realistic mock data based on:

- The product scope defined in this file
- Page-specific documentation
- Metric definitions
- Figma designs
- Required prototype interactions

Do not ask the user to manually provide mock data unless the required information cannot reasonably be derived from the available project context.

Mock data must be:

- Internally consistent
- Deterministic
- Realistic
- Reusable across screens
- Sufficient to demonstrate the designed interactions

Keep prototype data separate from presentation code.

Do not hardcode data directly inside UI components.

When the same entity appears across multiple screens, reuse the same underlying data. For example, a member shown in the Members page should represent the same member when shown in the Engagement or Network views.

## Project Documentation

### Page Specifications

Read the relevant page documentation before implementing a page.

Page documentation contains the metrics, calculations, data requirements, interactions, and behavior specific to that page.

Examples:

- `docs/pages/overview.md`
- `docs/pages/engagement.md`
- `docs/pages/members.md`
- `docs/pages/network.md`

Do not invent product logic or metric definitions when they are specified in the relevant page documentation.

### Design

Read `docs/design.md` for design tokens and visual implementation rules.

Figma remains the visual source of truth.

## Implementation Rules

### Figma

- Figma is the visual source of truth.
- Use Figma MCP before implementing a designed screen.
- Inspect the relevant Figma screen and components before implementation.
- Match the Figma design as closely as reasonably possible.
- Do not invent visual values when an equivalent value exists in the Figma design or design system.
- Two design files are in use:
  - v1: file key `leSvcL6Q3iSadrTYzarsy0` (earlier cards)
  - v2: file key `0MuD3anQwj511C8zXzBmvM` (newer designs, e.g. Most active channels)
- Ask the user for the current design file link when node IDs change between sessions.

### Components

- Reuse existing components whenever possible.
- Build reusable components when the same UI pattern appears in multiple places.
- Do not create duplicate components that serve the same purpose.
- Keep presentation components separate from data and business logic.
- CardTitle is a standing rule exception: always render title on the left and the control (tabs, etc.) on the right, even when Figma stacks them. Keep the CardTitle layout unchanged regardless of the design. When CardTitle has no `action`, apply 16px top padding (`.card-title-no-action`).

### Design Tokens

- Use the project's design tokens for colors, typography, spacing, borders, radii, and other reusable visual properties.
- Do not scatter repeated raw values throughout the codebase.
- If a value is clearly part of the design system, represent it as a reusable token.
- When reading a design from Figma, replace hardcoded values with the appropriate design token in code. Do not copy raw pixel values (font sizes, spacing, colors, radii) directly into components or CSS; map them to existing tokens or add a new token when the value is part of the design system.
- Prefer relative sizing (e.g. rem) over absolute pixel values for typography.

### Data and Logic

- Keep mock data separate from UI components.
- Keep calculations and data transformation logic separate from presentation code.
- Prefer deterministic data so the prototype produces the same results between sessions.
- Keep related entities consistent across the application.

### Recharts (v3)

- `pnpm` is not on PATH. Typecheck and build with `corepack pnpm exec tsc -b` and `corepack pnpm build`. A >500 kB chunk warning on build is expected and non-blocking.
- Recharts 3 tick labels render as `.recharts-cartesian-axis-tick-value` (not `.recharts-cartesian-axis-tick`). Grid lines are `.recharts-cartesian-grid-horizontal line`; tooltip classes are `.recharts-default-tooltip`, `.recharts-tooltip-label`, `.recharts-tooltip-item`.
- Style Recharts SVG text/lines via CSS overrides using design tokens; props like `tick={{ fontSize }}` are unreliable.
- `<Line fill="...">` is a no-op in Recharts 3 (the curve is always `fill: none`). To render a gradient fill under a line, use `<AreaChart>` + `<Area>` with `fill="url(#id)"` instead.
- Hiding a series from the tooltip: set `tooltipType="none"` on the item (it becomes impossible for the default tooltip).

### Quality

Before considering a page complete:

1. Compare the implementation against the Figma design.
2. Check all designed states and interactions.
3. Check that mock data produces believable results.
4. Check that related metrics remain internally consistent.
5. Check for obvious responsive and layout issues.
6. Remove unnecessary implementation complexity.
