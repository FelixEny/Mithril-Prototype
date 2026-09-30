import { getMemberAvatar } from '../avatars'

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
export const CELLS_PER_PAGE = Math.floor(PAGE / CELL)

const FONT = '600 56px "Inter", "Geist", system-ui, -apple-system, sans-serif'

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
  kind: 'none' | 'photo'
  color: string
  initial: string
  src?: string
}

export const avatarKeyOf = (kind: AvatarSpec['kind'], color: string, initial: string, src?: string): string =>
  kind === 'photo' ? `s:${src ?? ''}` : `i:${color}:${initial}`

export const avatarSpecFor = (memberId: string): AvatarSpec => {
  const spec = getMemberAvatar(memberId)
  // Only local images are drawn into the atlas (remote URLs risk CORS taint on
  // the page canvas that would break texImage2D). Everything else uses a
  // deterministic initials disc carrying the avatar color.
  const src = spec.src && !/^https?:/.test(spec.src) ? spec.src : undefined
  return {
    kind: spec.kind === 'photo' && src ? 'photo' : 'none',
    color: spec.color,
    initial: (spec.seed ?? memberId).charAt(0).toUpperCase(),
    src,
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
    const pagesNeeded = Math.max(1, Math.ceil(sorted.length / CELLS_PER_PAGE / CELLS_PER_PAGE))
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
      // Keys beyond the baked pages are folded onto the last page rather than
      // overflowing into a page that was never allocated (safe degrade; key
      // sets are bounded well under capacity by avatarKeyFor's palette/photo
      // space, so in practice this never triggers).
      const page = Math.min(Math.floor(i / (CELLS_PER_PAGE * CELLS_PER_PAGE)), pagesToCreate - 1)
      const rest = i % (CELLS_PER_PAGE * CELLS_PER_PAGE)
      const px = (rest % CELLS_PER_PAGE) * CELL
      const py = Math.floor(rest / CELLS_PER_PAGE) * CELL
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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.font = FONT
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(spec.initial, cx, cy + 2)
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
    const { width, height } = img
    const scale = Math.max(d / width, d / height)
    const iw = width * scale
    const ih = height * scale
    ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih)
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
      if (spec.kind === 'photo') this.photoSpecs.push({ key, spec })
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
      if (spec.kind === 'photo' && !this.photoSpecs.some((p) => p.key === key)) {
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
        // Keep the initials fallback that bakeInitials already drew.
        this.loadedPhotos.add(key)
      }
      img.src = spec.src
    }
  }

  has(key: string | undefined | null): boolean {
    return !!key && this.map.has(key)
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