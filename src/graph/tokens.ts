// Design-system token reader for canvas code.
//
// CSS custom properties cannot be used directly in canvas font strings, so the
// graph reads them off :root here. Resolution is lazy (first call) and cached so
// module imports — e.g. SSR probes — never touch the DOM.

let rootStyle: CSSStyleDeclaration | null = null
function root(): CSSStyleDeclaration | null {
  if (rootStyle) return rootStyle
  if (typeof document === 'undefined') return null
  rootStyle = getComputedStyle(document.documentElement)
  return rootStyle
}

/** Trimmed value of a `:root` custom property, or `fallback` when unset. */
export function readCssVar(name: string, fallback: string): string {
  const v = root()?.getPropertyValue(name).trim()
  return v || fallback
}

/** Resolve a length token to px: `rem` is scaled by the root font size (so it
 *  tracks the design system), other units are parsed directly. Returns
 *  `fallbackPx` when the token is missing or non-numeric. */
export function readCssPx(name: string, fallbackPx: number): number {
  const raw = readCssVar(name, '')
  if (!raw) return fallbackPx
  const n = parseFloat(raw)
  if (!Number.isFinite(n)) return fallbackPx
  if (raw.endsWith('rem')) {
    const rootPx = parseFloat(root()?.fontSize ?? '') || 16
    return n * rootPx
  }
  return n
}
