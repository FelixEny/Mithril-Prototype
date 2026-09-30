import { getMemberAvatar, type AvatarKind } from '../avatars'

// Baked texture atlas for member avatars.
//
// Each unique avatar is rendered into a 128px cell on a 2048px page
// (2px internal padding so neighbours don't bleed when the disc is magnified).
// Cells are packed deterministically (keys sorted) so the result is stable
// between sessions. Initials are baked synchronously at construction (fast
// first paint); photos decode async and repaint their cell when ready.

export const CELL = 128
export const PAD = 2
export const CONTENT = CELL - PAD * 2
export const PAGE = 2048
export const MAX_PAGES = 4
export const CELLS_PER_SIDE = Math.floor(PAGE / CELL)
export const CELLS_PER_PAGE = CELLS_PER_SIDE * CELLS_PER_SIDE

// Initials typography is token-driven: family/weight come from the design
// system vars set on :root, letter size follows the avatar-glyph ratio used by
// the UI avatar component (~44% of the disc). Resolved lazily so module
// imports (e.g. SSR probes) never touch the DOM.
let cssTokens: { family: string; weight: string; surface: string } | null = null
function readCssTokens(): { family: string; weight: string; surface: string } {
  if (cssTokens) return cssTokens
  const root = getComputedStyle(document.documentElement)
  cssTokens = {
    family: root.getPropertyValue('--font-family').trim() || 'Geist, sans-serif',
    weight: root.getPropertyValue('--font-weight-semibold').trim() || '600',
    surface: root.getPropertyValue('--surface-primary').trim() || '#FFFFFF',
  }
  return cssTokens
}

export interface AtlasRegion {
  page: number
  // Normalized texture coordinates of the padded cell's top-left corner.
  u0: number
  v0: number
  // Normalized width/height of the CONTENT area (excludes the internal pad).
  sNorm: number
  cellPx: number
  cellPy: number
}

export interface AvatarSpec {
  kind: AvatarKind
  color: string
  initial: string
  src?: string
}

export const avatarKeyOf = (kind: AvatarKind, color: string, initial: string, src?: string): string =>
  kind === 'none' ? `i:${color}:${initial}` : `s:${src ?? ''}`

export const avatarSpecFor = (memberId: string): AvatarSpec => {
  const spec = getMemberAvatar(memberId)
  // The source type is preserved end to end (local photo / Pravatar / DiceBear
  // all render as "image avatars"; 'none' renders initials). The initial comes
  // from the member's display name, never the hashed avatar seed (numeric).
  return {
    kind: spec.kind,
    color: spec.color,
    initial: (spec.name ?? '').trim().charAt(0).toUpperCase() || '?',
    src: spec.src ?? undefined,
  }
}

/** Canonical atlas key for a member — single source of truth for population
 *  and atlas bookkeeping so both always agree (and stay bounded by the palette
 *  × initials × local-photos space even for remote-only avatar kinds). */
export const avatarKeyFor = (memberId: string): string => {
  const spec = avatarSpecFor(memberId)
  return avatarKeyOf(spec.kind, spec.color, spec.initial, spec.src)
}

interface Cell {
  page: number
  px: number
  py: number
}

export class MemberAtlas {
  readonly map = new Map<string, AtlasRegion>()
  pages: HTMLCanvasElement[] = []
  private cells = new Map<string, Cell>()
  private photoSpecs: { key: string; spec: AvatarSpec }[] = []
  revision = 0
  private onUpdate: (() => void) | null = null
  private loadedPhotos = new Set<string>()
  private failedPhotos = new Set<string>()

  constructor() {}

  /**
   * Deterministically claim cells for every key. Must be called once before
   * any baking, with the complete key set of the current population.
   */
  claim(keys: string[]): void {
    if (this.pages.length > 0) {
      throw new Error('MemberAtlas: claim() must be called before baking')
    }
    // Dedupe first: the caller passes one key per member, but shared faces
    // and shared initials discs mean only a few hundred keys are distinct.
    // Counting duplicates here used to inflate the page math and fold the
    // tail of the list onto the last page, colliding distinct keys
    // last-write-wins onto the same cell (wrong avatars).
    const sorted = [...new Set(keys)].sort()
    const pagesNeeded = Math.max(1, Math.ceil(sorted.length / CELLS_PER_PAGE))
    if (pagesNeeded > MAX_PAGES) {
      throw new Error(`MemberAtlas: ${sorted.length} distinct avatars need ${pagesNeeded} pages (max ${MAX_PAGES})`)
    }
    const pagesToCreate = Math.min(MAX_PAGES, pagesNeeded)
    for (let p = 0; p < pagesToCreate; p++) {
      const canvas = document.createElement('canvas')
      canvas.width = PAGE
      canvas.height = PAGE
      this.pages.push(canvas)
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, PAGE, PAGE)
    }
    for (let i = 0; i < sorted.length; i++) {
      const key = sorted[i]
      // Every claimed key gets its own cell (i < pagesNeeded * CELLS_PER_PAGE,
      // so floor(i / CELLS_PER_PAGE) is always a real page — no folding).
      const page = Math.floor(i / CELLS_PER_PAGE)
      const rest = i % CELLS_PER_PAGE
      const px = (rest % CELLS_PER_SIDE) * CELL
      const py = Math.floor(rest / CELLS_PER_SIDE) * CELL
      this.cells.set(key, { page, px, py })
      this.map.set(key, {
        page,
        u0: (px + PAD) / PAGE,
        v0: (py + PAD) / PAGE,
        sNorm: CONTENT / PAGE,
        cellPx: px,
        cellPy: py,
      })
    }
  }

  /** Bake the initials representation of a key into its cell. */
  private bake(key: string, spec: AvatarSpec): void {
    const cell = this.cells.get(key)
    if (!cell) return
    const ctx = this.pages[cell.page].getContext('2d')!
    const cx = cell.px + CELL / 2
    const cy = cell.py + CELL / 2
    const r = CONTENT / 2 - 2
    ctx.save()
    ctx.clearRect(cell.px, cell.py, CELL, CELL)
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = spec.color
    ctx.fill()
    ctx.strokeStyle = 'rgba(13, 17, 33, 0.06)'
    ctx.lineWidth = 2
    ctx.stroke()
    // Content is mirrored on the Y axis: the node shader maps the disc's
    // screen-top edge to the cell's bottom row (sigma's camera never flips Y),
    // so without the mirror every avatar would bake upside down. The initial
    // is centered mathematically — textAlign/textBaseline do the centering,
    // no manual offsets.
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(1, -1)
    const t = readCssTokens()
    ctx.fillStyle = t.surface
    ctx.font = `${t.weight} ${Math.round(CONTENT * 0.44)}px ${t.family}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spec.initial, 0, 0)
    ctx.restore()
    ctx.restore()
  }

  private drawPhoto(key: string, spec: AvatarSpec, img: HTMLImageElement): void {
    const cell = this.cells.get(key)
    if (!cell) return
    const ctx = this.pages[cell.page].getContext('2d')!
    const cx = cell.px + CELL / 2
    const cy = cell.py + CELL / 2
    const d = CONTENT
    ctx.save()
    ctx.clearRect(cell.px, cell.py, CELL, CELL)
    ctx.beginPath()
    ctx.arc(cx, cy, d / 2 - 1, 0, Math.PI * 2)
    // Draw the image clipped to the disc. Preserve aspect by covering.
    ctx.save()
    ctx.clip()
    // Same Y-mirror as bake(): the shader samples this cell's rows in reverse
    // on screen, so the image is drawn flipped to come out upright.
    ctx.translate(cx, cy)
    ctx.scale(1, -1)
    const { width, height } = img
    const scale = Math.max(d / width, d / height)
    const iw = width * scale
    const ih = height * scale
    ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih)
    ctx.restore()
    ctx.strokeStyle = 'rgba(13, 17, 33, 0.08)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
    void spec
  }

  /**
   * Bake initials for every claimed key synchronously. Photo entries receive
   * an initials placeholder until their image decodes.
   */
  bakeInitials(getSpec: (key: string) => AvatarSpec): void {
    for (const key of this.map.keys()) {
      const spec = getSpec(key)
      this.bake(key, spec)
      if (spec.kind !== 'none') this.photoSpecs.push({ key, spec })
    }
    this.revision++
  }

  /** Kick off async photo decoding; calls onUpdate whenever a cell repaints. */
  loadPhotos(getSpec: (key: string) => AvatarSpec, onUpdate: () => void): void {
    this.onUpdate = onUpdate
    const specs = this.photoSpecs.length ? this.photoSpecs : []
    // Build the full photo spec list deterministically (sorted key order).
    for (const key of [...this.map.keys()].sort()) {
      const spec = getSpec(key)
      if (spec.kind !== 'none' && !this.photoSpecs.some((p) => p.key === key)) {
        specs.push({ key, spec })
      }
    }
    if (specs.length === 0) return
    for (const { key, spec } of specs) {
      if (!spec.src) continue
      const img = new Image()
      if (/^https?:/.test(spec.src)) img.crossOrigin = 'anonymous'
      img.onload = () => {
        this.drawPhoto(key, spec, img)
        this.loadedPhotos.add(key)
        this.revision++
        this.onUpdate?.()
      }
      img.onerror = () => {
        // CORS-blocked or failed images keep the initials fallback that
        // bakeInitials already drew — never a blank colored circle.
        this.loadedPhotos.add(key)
        this.failedPhotos.add(key)
        this.onUpdate?.()
      }
      img.src = spec.src
    }
  }

  has(key: string | undefined | null): boolean {
    return !!key && this.map.has(key)
  }

  hasLoaded(key: string | undefined | null): boolean {
    return !!key && this.loadedPhotos.has(key)
  }

  hasFailed(key: string | undefined | null): boolean {
    return !!key && this.failedPhotos.has(key)
  }

  region(key: string | undefined | null): AtlasRegion | undefined {
    if (!key) return undefined
    return this.map.get(key)
  }

  keyCount(): number {
    return this.map.size
  }

  pageCount(): number {
    return this.pages.length
  }
}

export function uploadAtlasPages(gl: WebGLRenderingContext, atlas: MemberAtlas, glTextures: (WebGLTexture | null)[]): void {
  for (let p = 0; p < atlas.pages.length; p++) {
    const tex = glTextures[p] ?? gl.createTexture()
    glTextures[p] = tex
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // The page canvas is power-of-two; clamp is safe and bleeding-free.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.pages[p])
  }
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function createFallbackTexture(gl: WebGLRenderingContext): WebGLTexture {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))
  gl.bindTexture(gl.TEXTURE_2D, null)
  return tex
}