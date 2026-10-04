import { Sigma } from 'sigma'
import Graph from 'graphology'
import { createNodeCompoundProgram } from 'sigma/rendering'
import { buildPopulation, avatarAttrsOf, clusterColorOf, type MemberFilterLike } from './build'
import { MemberAtlas, avatarKeyFor, avatarSpecFor, avatarKeyOf, type AvatarSpec } from './textures'
import { readCssVar, readCssPx } from './tokens'
import { createMemberNodeProgram } from './programs/node'
import { NodeHaloProgram } from './programs/halo'
import { getMemberAvatar, type AvatarKind } from '../avatars'
import type { RelationshipsData, StrengthLabel } from '../relationships'

export type GraphFilter = 'all' | 'strong' | 'mid' | 'weak'

// Avatar disc radii (world units) by degree. Compact on purpose: at fit zoom
// one world unit is ~1 css px, so members read 18-40px across and the
// per-node halo wash (5x, Marvel's ratio) carries the cluster structure.
// Zoom growth is capped in the reducer (AVATAR_MAX_R_PX), so deep zoom stays
// clean instead of exploding like the old tiered growth.
const RADII = [9, 12, 15, 18, 20]
const sizeForDegree = (deg: number): number => {
  if (deg >= 151) return RADII[4]
  if (deg >= 76) return RADII[3]
  if (deg >= 31) return RADII[2]
  if (deg >= 11) return RADII[1]
  return RADII[0]
}
// Avatar screen ceiling: radius in css px. Only the avatar grows with zoom,
// and never past this (Marvel keeps overview avatars small the same way).
const AVATAR_MAX_R_PX = 26
// Focused member emphasis (Marvel: size x1.75; ours starts smaller, x1.5
// under the same ceiling reads the same).
const FOCUS_GROW = 1.5
// Hover emphasis: a real avatar (Mid/Detail, not a dim dot) swells 8% while
// hovered. Applied on top of the resting ceiling so the full growth is visible
// even when the resting avatar is already capped.
const HOVER_GROW = 1.08

// Zoom-graduated edge reveal by k = 1 / camera.ratio. Only the COUNT changes
// with zoom — every visible edge holds a constant screen width, so zooming
// reveals detail instead of growing chunky lines.
const REVEAL_K1 = 2.1
const REVEAL_K2 = 3.5
const EDGE_BUDGET_FIT = 2500
const EDGE_BUDGET_MID_CAP = 6000
const EDGE_BUDGET_DEEP_CAP = 12000

// Level-of-detail tiers reuse the same k = 1/ratio boundaries as the edge
// reveal above, so node detail and relationship detail flip together. LOD only
// changes node representation: the member population is never filtered.
// Overview collapses every member to a constant-screen-size cluster dot; Mid
// caps avatars below the Detail ceiling.
const LOD_DOT_R_PX = 2.5
const AVATAR_MID_R_PX = 16

// Constant screen widths (css px) — the edge reducer converts these to world
// sizes every refresh, cancelling sigma's zoom growth exactly. The resting web
// has one width; selected relationships use STRENGTH_W above.
const EDGE_W_DEFAULT = 1.25

// Ring thickness (css px), painted OUTSIDE the avatar edge. The node shader
// converts it to world units per frame, so it holds this thickness at any
// zoom and for any avatar size.
const RING_W = 2

// Per-node halo tuning (Marvel: size 5x, intensity ~0.05*log at rest,
// 0.65-0.75 on focus). Ours reads slightly stronger so the cluster wash is
// visible over the dotted background at overview.
const HALO_SCALE = 5
const HALO_ALPHA = 0.3
const HALO_ALPHA_NB = 0.45
const HALO_ALPHA_FOCUS = 0.6
const HALO_FOCUS_SCALE = 3.5
const HALO_NB_SCALE = 2

const COLORS = {
  surface: '#F4F5F7',
  strong: '#42BB00',
  mid: '#FDAB00',
  weak: '#FF3838',
  faint: '#E3E5EE',
  brand: '#693CF3',
  bridge: '#009A47',
  dim: '#E8EAF0',
  edgeDefault: '#D1D5DB',
} as const

const STRENGTH_COLOR: Record<StrengthLabel, string> = {
  strong: COLORS.strong,
  mid: COLORS.mid,
  weak: COLORS.weak,
}
// Selected-member relationship width (css px). One width for every strength
// level: color alone carries strong / mid / weak, so thickness never competes
// with hue. Matches the legend swatch height.
const STRENGTH_W = 2

export const filterAllows = (f: GraphFilter, label: StrengthLabel): boolean => f === 'all' || f === label

export const hexMix = (a: string, b: string, t: number): string => {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ra = pa >> 16
  const ga = (pa >> 8) & 0xff
  const ba = pa & 0xff
  const rb = pb >> 16
  const gb = (pb >> 8) & 0xff
  const bb = pb & 0xff
  const r = Math.round(ra + (rb - ra) * t)
  const g = Math.round(ga + (gb - ga) * t)
  const bl = Math.round(ba + (bb - ba) * t)
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`
}

// Member-name typography is token-driven: family, size and weights come from
// the :root design-system vars. Resolved lazily (first call) and cached so
// module imports never touch the DOM.
let labelTypography: {
  family: string
  sizePx: number
  weightRegular: string
  weightSemibold: string
} | null = null
function readLabelTypography(): {
  family: string
  sizePx: number
  weightRegular: string
  weightSemibold: string
} {
  if (!labelTypography) {
    labelTypography = {
      family: readCssVar('--font-family', '"Geist", sans-serif'),
      sizePx: readCssPx('--font-size-12', 12),
      weightRegular: readCssVar('--font-weight-regular', '400'),
      weightSemibold: readCssVar('--font-weight-semibold', '600'),
    }
  }
  return labelTypography
}

// Sigma's built-in disc label anchors names to the RIGHT of the node
// (`x + size + 3`). Mithril wants names centred BELOW the avatar, so we supply
// our own renderer using the same font/colour tokens. Coordinates are viewport
// px and `data.size` is the on-screen disc radius, matching sigma's default.
function drawLabelBelow(context: CanvasRenderingContext2D, data: DisplayNode, settings: DisplayNode): void {
  if (!data.label) return
  const color = settings.labelColor?.attribute
    ? data[settings.labelColor.attribute] || settings.labelColor.color || '#6B7280'
    : settings.labelColor?.color || '#6B7280'
  // Per-node weight (semi-bold on hover/selection/search) overrides the rest
  // weight; both come from the design-system weight tokens.
  const weight = data.labelWeight ?? settings.labelWeight
  context.save()
  context.fillStyle = color
  context.font = `${weight} ${settings.labelSize}px ${settings.labelFont}`
  context.textAlign = 'center'
  context.textBaseline = 'top'
  context.fillText(data.label, data.x, data.y + data.size + 4)
  context.restore()
}

// Sigma's default hover renderer (drawDiscNodeHover) paints a white rounded
// box with a black drop shadow to the RIGHT of the hovered node. Mithril's only
// member name is the below-avatar label, so hover draws nothing extra here.
function drawNothing(): void {}

export interface GraphEngineHandlers {
  onSelect: (id: string | null) => void
  onAvatarDiagnostics?: (d: AvatarDiagnostics) => void
}

export interface AvatarDiagnostics {
  total: number
  localPhotos: { total: number; loaded: number; failed: number }
  pravatar: { total: number; loaded: number; failed: number }
  dicebear: { total: number; loaded: number; failed: number }
  initials: number
}

type NodeAttrs = {
  x: number
  y: number
  label: string
  name: string
  username: string | null
  degree: number
  influence: number
  clusterId: number
  bridge: boolean
  mostConnected: boolean
  avatarKey?: string
  avatarKind?: AvatarKind
  avatarColor?: string
  clusterColor?: string
  haloColor?: string
}

type EdgeAttrs = { label: StrengthLabel; score: number; rank: number }

type DisplayNode = Record<string, any>
type DisplayEdge = Record<string, any>

export class GraphEngine {
  private container: HTMLElement
  private handlers: GraphEngineHandlers
  private data: RelationshipsData
  private memberFilter: MemberFilterLike = { cluster: null, minDegree: null }
  private filter: GraphFilter = 'all'

  private sigma: Sigma<NodeAttrs, EdgeAttrs>
  private graph = new Graph<NodeAttrs, EdgeAttrs>()
  private atlas: MemberAtlas
  private programClass: any
  private memberClass: any

  private hoveredId: string | null = null
  private selectedId: string | null = null
  private searchQuery = ''
  private importantIds = new Set<string>()
  // Mid-tier label set: bridges, top-30 influencers and most-connected members.
  private labelIds = new Set<string>()
  private popIds: string[] = []

  private nbsCache = new Map<string, Set<string>>()
  // Zoom-graduated edge reveal tier (0 fit / 1 mid / 2 deep), refreshed from
  // the camera. Only edge COUNT follows it — sizes stay constant.
  private revealTier = 0
  // Per-population edge budgets (rank caps by score desc): fit shows the
  // network spine, deeper zoom reveals more, capped for paint cost.
  private edgeBudgetFit = EDGE_BUDGET_FIT
  private edgeBudgetMid = EDGE_BUDGET_FIT
  private edgeBudgetDeep = EDGE_BUDGET_FIT
  // Cached camera metrics (refreshed on 'updated') so the reducers never call
  // sigma.scaleSize() per node/edge — this is O(1) instead of O(E) api calls.
  private scaleBase = 1
  private camRatio = 1
  // Photo-rebuild coalescing + a generation guard so in-flight image loads
  // from a superseded population can't re-register programs against the new
  // atlas.
  private photoRebuildTimer: ReturnType<typeof setTimeout> | null = null
  private populationGen = 0

  private resizeObserver: ResizeObserver | null = null
  // Graph mode flag + a wheel guard for the zoom bounds. Sigma only calls
  // preventDefault() when a wheel actually changes the camera ratio, so at the
  // min/max ratio the raw event bubbles to the page and scrolls it. While
  // interactive we prevent that here so the graph holds until the user leaves
  // graph mode; the guard is a no-op while idle so the page still scrolls.
  private interactive = false
  private wheelGuard = (e: WheelEvent) => { if (this.interactive) e.preventDefault() }

  constructor(container: HTMLElement, data: RelationshipsData, handlers: GraphEngineHandlers) {
    this.container = container
    this.data = data
    this.handlers = handlers
    this.atlas = new MemberAtlas()

    this.memberClass = createMemberNodeProgram(this.atlas)
    // Halos render as the first sub-program of the same node draw pass, so
    // every wash sits underneath every avatar (Marvel's compound pattern).
    // The hover layer keeps the bare member program so the selected member
    // doesn't get a doubled halo.
    this.programClass = createNodeCompoundProgram([NodeHaloProgram, this.memberClass])

    const typo = readLabelTypography()
    const settings: Record<string, unknown> = {
      defaultNodeType: 'member',
      defaultEdgeType: 'line',
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      allowInvalidContainer: true,
      nodeProgramClasses: { member: this.programClass },
      nodeHoverProgramClasses: { member: this.memberClass },
      itemSizesReference: 'positions',
      // Sublinear zoom-size growth (r^0.75, same curve Marvel uses): node
      // world sizes still behave exactly as calibrated at fit (ratio 1 ->
      // factor 1) but grow slower than 1/r when zoomed in. Edges and the
      // avatar ceiling are additionally compensated in the reducers, so
      // their screen sizes stay constant.
      zoomToSizeRatioFunction: (r: number) => Math.pow(r, 0.75),
      enableCameraRotation: false,
      cameraPanBoundaries: null,
      minCameraRatio: 0.15,
      maxCameraRatio: 3.2,
      zoomingRatio: 1.2,
      doubleClickZoomingRatio: 1.4,
      minEdgeThickness: 0.5,
      labelRenderedSizeThreshold: 6,
      labelDensity: 1.2,
      labelGridCellSize: 120,
      // Movement LOD: cheap focused rendering while panning/zooming; sigma
      // restores the full scene once the camera settles.
      hideLabelsOnMove: true,
      hideEdgesOnMove: true,
      labelColor: { color: '#6B7280' },
      // Names sit centred below the avatar rather than sigma's default
      // right-of-node placement. Family, size (12px) and the rest weight all
      // come from design-system tokens; emphasised members override the weight
      // per node in the reducer.
      defaultDrawNodeLabel: drawLabelBelow,
      labelFont: typo.family,
      labelWeight: typo.weightRegular,
      labelSize: typo.sizePx,
      // Suppress sigma's default hover box (a white, shadowed name drawn to the
      // right of the node). Hover is a name-emphasis affordance only, and the
      // sole member name is the below-avatar label.
      defaultDrawNodeHover: drawNothing,
      defaultNodeColor: '#693CF3',
    }

    this.sigma = new Sigma(this.graph, container, settings as any)

    this.camRatio = this.sigma.getCamera().ratio
    this.scaleBase = this.sigma.scaleSize(1)

    this.bindCaptors()
    this.bindCamera()
    this.container.addEventListener('wheel', this.wheelGuard, { passive: false })
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.sigma.resize()
        this.sigma.scheduleRefresh()
      })
      this.resizeObserver.observe(container)
    }

    this.setPopulation()
    this.applyFilter('all')
  }

  // --- Population & graph management ---------------------------------------

  /** Swap the underlying data set and rebuild the population in place. The
   *  member filter is kept; callers driving both data and filters set the
   *  filter first via applyMemberFilter after a no-op guard (or hit a single
   *  rebuild through the cache). */
  setData(data: RelationshipsData): void {
    if (this.data === data) return
    this.data = data
    this.setPopulation()
    this.handlers.onSelect(null)
  }

  private setPopulation(): void {
    const pop = buildPopulation(this.data, this.memberFilter)
    const gen = ++this.populationGen
    // Zoom-graduated edge reveal budgets (rank caps by score desc): the fit
    // view shows the network spine, deeper zoom reveals more, hard-capped so
    // the 90d population can't blow the paint budget.
    const edgeCount = pop.edges.length
    this.edgeBudgetFit = Math.min(EDGE_BUDGET_FIT, edgeCount)
    this.edgeBudgetMid = Math.min(Math.ceil(edgeCount / 2), EDGE_BUDGET_MID_CAP)
    this.edgeBudgetDeep = Math.min(edgeCount, EDGE_BUDGET_DEEP_CAP)
    this.revealTier = 0

    this.importantIds = new Set(pop.members.slice(0, 30).map((m) => m.id))
    for (const m of pop.members) {
      if (m.bridge || m.mostConnected || m.degree >= 40) this.importantIds.add(m.id)
    }
    // Mid LOD labels only bridges, the top-30 by influence and most-connected
    // members — narrower than the degree>=40 set used at Detail.
    this.labelIds = new Set(pop.members.slice(0, 30).map((m) => m.id))
    for (const m of pop.members) {
      if (m.bridge || m.mostConnected) this.labelIds.add(m.id)
    }

    // Atlas: claim + bake initials synchronously; photos decode async.
    this.atlas = new MemberAtlas()
    this.popIds = pop.members.map((m) => m.id)
    const keySpec = new Map<string, AvatarSpec>()
    for (const m of pop.members) {
      const spec = avatarSpecFor(m.id)
      keySpec.set(avatarKeyOf(spec.kind, spec.color, spec.initial, spec.src), spec)
    }
    this.atlas.claim(pop.avatarKeys)
    this.atlas.bakeInitials((key) => keySpec.get(key) ?? { kind: 'none', color: '#693CF3', initial: '?' })
    this.atlas.loadPhotos((key) => keySpec.get(key) ?? { kind: 'none', color: '#693CF3', initial: '?' }, () => {
      // Stale callback from a superseded population — its atlas is gone.
      if (gen !== this.populationGen) return
      // Any repaint of the atlas needs a fresh program so freshly-uploaded
      // page textures are picked up. Photo arrivals land in a burst (~100
      // faces), so coalesce them into a few rebuilds instead of one per image.
      if (this.photoRebuildTimer) clearTimeout(this.photoRebuildTimer)
      this.photoRebuildTimer = setTimeout(() => {
        this.photoRebuildTimer = null
        if (gen !== this.populationGen) return
        this.reRegisterPrograms()
        this.emitAvatarDiagnostics()
      }, 150)
    })
    this.emitAvatarDiagnostics()

    // Graph: nodes + attributed edges (rank by score desc).
    const graph = new Graph<NodeAttrs, EdgeAttrs>()
    for (const m of pop.members) {
      const info = this.data.memberInfo.get(m.id)
      const p = pop.positioned.get(m.id)
      if (!info || !p) continue
      const av = avatarAttrsOf(m.id)
      const clusterColor = clusterColorOf(m.clusterId)
      graph.addNode(m.id, {
        x: p.x,
        y: p.y,
        label: m.name,
        name: m.name,
        username: info.username ?? null,
        degree: m.degree,
        influence: m.influence,
        clusterId: m.clusterId,
        bridge: m.bridge,
        mostConnected: m.mostConnected,
        avatarKey: av.avatarKey,
        avatarKind: av.avatarKind,
        avatarColor: av.avatarColor,
        clusterColor,
        // Halo wash: cluster tint lightened toward white (Marvel lightens ~75).
        haloColor: hexMix(clusterColor, '#FFFFFF', 0.72),
      })
    }
    pop.edges.forEach((e, rank) => {
      if (graph.hasNode(e.a) && graph.hasNode(e.b)) {
        graph.addEdge(e.a, e.b, { label: e.label, score: e.score, rank })
      }
    })

    this.graph = graph
    this.nbsCache.clear()
    // A population swap invalidates any in-flight hover (the hover pointer may
    // reference a node that no longer exists); sigma nulls its hovered node
    // without emitting leaveNode, so reset the cursor here too.
    this.hoveredId = null
    this.memberCursor(false)
    this.sigma.setSettings({
      nodeReducer: this.nodeReducer.bind(this),
      edgeReducer: this.edgeReducer.bind(this),
    } as any)
    this.sigma.setGraph(graph)
    // First paint must already sample the real atlas: the GL programs were
    // constructed against the (empty) construction-time atlas, and the photo
    // callback above only fires when at least one photo decodes.
    this.reRegisterPrograms()
    this.sigma.getCamera().animatedReset({ duration: 0 })
  }

  /** Rebuild the member/compound node programs against the current atlas and
   *  push them into sigma (which kills + re-instantiates the GL programs, so
   *  freshly painted atlas pages get uploaded), then refresh. */
  private reRegisterPrograms(): void {
    this.memberClass = createMemberNodeProgram(this.atlas)
    this.programClass = createNodeCompoundProgram([NodeHaloProgram, this.memberClass])
    this.sigma.setSettings({ nodeProgramClasses: { member: this.programClass }, nodeHoverProgramClasses: { member: this.memberClass } } as any)
    this.sigma.refresh()
  }

  // --- Public API ----------------------------------------------------------

  applyFilter(f: GraphFilter): void {
    if (this.filter === f) return
    this.filter = f
    this.sigma.refresh()
  }

  applyMemberFilter(mf: MemberFilterLike): void {
    if (this.memberFilter.cluster === mf.cluster && this.memberFilter.minDegree === mf.minDegree) return
    this.memberFilter = mf
    this.setPopulation()
    this.handlers.onSelect(null)
  }

  setSelected(id: string | null): void {
    if (this.selectedId === id) return
    this.selectedId = id
    // Entering the selected state suppresses hover entirely: drop any hover
    // that was active when the click landed so it can't leak into the ego view.
    if (id !== null) this.hoveredId = null
    this.sigma.refresh()
  }

  setHovered(id: string | null): void {
    if (this.hoveredId === id) return
    this.hoveredId = id
    this.sigma.refresh()
  }

  setSearch(q: string): void {
    if (this.searchQuery === q) return
    this.searchQuery = q
    this.nbsCache.clear()
    this.sigma.refresh()
  }

  /** Gate direct canvas interaction (pan/zoom/hover/node-click). While idle the
   *  sigma captors are disabled, so the wheel scrolls the page and no member is
   *  hovered; the idle cursor is set on the container. Activating restores the
   *  full interaction model and arms the wheel guard so the page can't scroll
   *  when the camera is pinned at a zoom bound. Direct API calls
   *  (setHovered/setSelected/etc.) still work while idle so probes and
   *  programmatic focus are unaffected. */
  setInteractive(on: boolean): void {
    this.interactive = on
    this.sigma.getMouseCaptor().enabled = on
    this.sigma.getTouchCaptor().enabled = on
    this.container.classList.toggle('is-idle', !on)
    if (!on) {
      this.setHovered(null)
      this.memberCursor(false)
    }
  }

  searchMatches(): { id: string; name: string; username: string | null; clusterId: number; degree: number }[] {
    const q = this.searchQuery.trim().toLowerCase()
    if (!q) return []
    const out: { id: string; name: string; username: string | null; clusterId: number; degree: number }[] = []
    this.graph.forEachNode((id, attrs) => {
      if (attrs.name.toLowerCase().includes(q) || (attrs.username ?? '').toLowerCase().includes(q)) {
        out.push({ id, name: attrs.name, username: attrs.username ?? null, clusterId: attrs.clusterId, degree: attrs.degree })
      }
    })
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }

  populationCount(): number {
    return this.graph.order
  }

  isEmpty(): boolean {
    return this.graph.order === 0
  }

  flyTo(id: string): void {
    if (!this.graph.hasNode(id)) return
    const attrs = this.graph.getNodeAttributes(id)
    const camera = this.sigma.getCamera()
    const ratio = Math.min(0.28, camera.ratio * 0.5)
    const bbox = this.sigma.getBBox()
    const span = Math.max(bbox.x[1] - bbox.x[0], bbox.y[1] - bbox.y[0]) || 1
    // Reconstruct sigma's normalization function from the current node extent
    // (see createNormalizationFunction): framed = 0.5 + (p - center) / span.
    const framed = {
      x: 0.5 + (attrs.x - (bbox.x[0] + bbox.x[1]) / 2) / span,
      y: 0.5 + (attrs.y - (bbox.y[0] + bbox.y[1]) / 2) / span,
    }
    camera.animate({ x: framed.x, y: framed.y, ratio }, { duration: this.motionMs(550), easing: 'cubicInOut' })
    this.setSelected(id)
  }

  zoomIn(): void {
    const camera = this.sigma.getCamera()
    camera.animatedZoom({ factor: 1.25, duration: this.motionMs(250) })
  }

  zoomOut(): void {
    const camera = this.sigma.getCamera()
    camera.animatedZoom({ factor: 0.8, duration: this.motionMs(250) })
  }

  fit(): void {
    this.sigma.getCamera().animatedReset({ duration: this.motionMs(500), easing: 'cubicInOut' })
  }

  destroy(): void {
    if (this.photoRebuildTimer) {
      clearTimeout(this.photoRebuildTimer)
      this.photoRebuildTimer = null
    }
    this.resizeObserver?.disconnect()
    this.container.removeEventListener('wheel', this.wheelGuard)
    this.sigma.kill()
  }

  getGraph(): Graph<NodeAttrs, EdgeAttrs> {
    return this.graph
  }

  getSigma(): Sigma<NodeAttrs, EdgeAttrs> {
    return this.sigma
  }

  // --- Avatar diagnostics (dev only) ---------------------------------------

  /** Per-member avatar pipeline counts for the current population — orginal
   *  kinds preserved, loaded/failed resolved from the atlas. */
  getAvatarDiagnostics(): AvatarDiagnostics {
    const d: AvatarDiagnostics = {
      total: this.popIds.length,
      localPhotos: { total: 0, loaded: 0, failed: 0 },
      pravatar: { total: 0, loaded: 0, failed: 0 },
      dicebear: { total: 0, loaded: 0, failed: 0 },
      initials: 0,
    }
    for (const id of this.popIds) {
      const kind = getMemberAvatar(id).kind
      const key = avatarKeyFor(id)
      if (kind === 'none') {
        d.initials++
        continue
      }
      const bucket = kind === 'photo' ? d.localPhotos : kind === 'pravatar' ? d.pravatar : d.dicebear
      bucket.total++
      if (this.atlas.hasFailed(key)) {
        bucket.failed++
      } else if (this.atlas.hasLoaded(key)) {
        bucket.loaded++
      }
    }
    return d
  }

  private emitAvatarDiagnostics(): void {
    this.handlers.onAvatarDiagnostics?.(this.getAvatarDiagnostics())
  }

  private motionMs(ms: number): number {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
    }
    return ms
  }

  // --- Reducers ------------------------------------------------------------

  private focus(): string | null {
    return this.selectedId
  }

  /** Toggle the member pointer cursor on the graph container. The background
   *  keeps its grab/grabbing pan cursor because the class is only set while a
   *  clickable member is under the pointer. */
  private memberCursor(on: boolean): void {
    this.container.classList.toggle('is-member-hover', on)
  }

  private neighborsOf(id: string): Set<string> {
    let nb = this.nbsCache.get(id)
    if (nb) return nb
    nb = new Set<string>()
    const graph = this.graph
    // Direct relationships are symmetric: count an edge in either direction
    // (the graph is mixed/directed, so forEachOutboundEdge would miss half).
    for (const neighbor of graph.neighbors(id)) nb.add(neighbor)
    this.nbsCache.set(id, nb)
    return nb
  }

  /** Device px per css px (sigma sizes in backing-store px). */
  private devicePx(): number {
    return Math.min(2, typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1)
  }

  /** World radius for a target avatar radius in css px. Sigma renders node
   *  device-px radius as a_size x scaleSize(1), so this cancels zoom exactly
   *  and the avatar ceiling holds at any depth. */
  private nodeWorldForRadius(pxCss: number): number {
    const s = this.scaleBase
    if (!Number.isFinite(s) || s <= 0) return pxCss
    return (pxCss * this.devicePx()) / s
  }

  /** World thickness for a target edge width in css px. Edge device-px
   *  thickness is world x gtv (no zoom-function attenuation), with
   *  gtv = scaleSize(1) x zf(ratio) / ratio — so this holds edges constant
   *  while zooming. */
  private edgeWorldFor(pxCss: number): number {
    const s = this.scaleBase
    const r = this.camRatio
    if (!Number.isFinite(s) || s <= 0 || !Number.isFinite(r) || r <= 0) return pxCss
    return (pxCss * this.devicePx() * r) / (s * Math.pow(r, 0.75))
  }

  private nodeReducer(node: string, data: DisplayNode): Partial<DisplayNode> {
    const attrs = this.graph.getNodeAttributes(node)
    const focusId = this.focus()
    const q = this.searchQuery.trim().toLowerCase()
    const hit = !!q && (attrs.name.toLowerCase().includes(q) || (attrs.username ?? '').toLowerCase().includes(q))
    const m = (() => {
      // The selected member keeps its avatar no matter what: search results,
      // non-matches and ego dimming must never hide or replace it. Hover is
      // deliberately absent here — hovering never dims or reveals anything.
      if (focusId === node) return true
      if (q && !hit) return false
      if (focusId && !this.neighborsOf(focusId).has(node)) return false
      return true
    })()

    // An active search or a selection turns LOD off: the ego view and search
    // results keep full avatars and names at every zoom, so the selected or
    // searched member stays identifiable. Hover does NOT override LOD, and LOD
    // otherwise only shapes the resting, unfiltered view.
    const lodTier = focusId !== null || q !== '' ? 2 : this.revealTier

    const dim = !m
    const base = sizeForDegree(attrs.degree)
    const cap = this.nodeWorldForRadius(AVATAR_MAX_R_PX)

    const selected = node === this.selectedId
    // Hover emphasis is fully suppressed while a member is selected.
    const hovered = node === this.hoveredId && this.selectedId === null
    const important = this.importantIds.has(node)
    const labelable = this.labelIds.has(node)
    const isFocus = focusId !== null && node === focusId
    const nbs = focusId !== null && !isFocus ? this.neighborsOf(focusId) : null
    const isNeighbor = nbs !== null && nbs.has(node)

    // Ring: selected > search hit > bridge. Widths are css px, converted to
    // device px here and kept constant on screen by the shader. Hover draws no
    // ring — its emphasis is the member's own name (semi-bold) plus a small
    // avatar swell, both applied below.
    let ring: [number, number, number, number] | null = null
    let ringWidth = 0
    if (selected || (q && hit)) {
      ring = [0x69 / 255, 0x3c / 255, 0xf3 / 255, 1]
      ringWidth = RING_W * this.devicePx()
    } else if (attrs.bridge) {
      ring = [0x00 / 255, 0x9a / 255, 0x47 / 255, 1]
      ringWidth = RING_W * this.devicePx()
    }

    // Size + halo follow Marvel's focus model: rest members carry a soft 5x
    // cluster wash; the focused member grows (under the ceiling) with a strong
    // halo; neighbors keep a medium wash; everyone else collapses to a faint
    // dot with no halo. Halo sizes derive from the tier-independent avatar size
    // so the cluster wash survives the Overview collapse to dots. Hover swells
    // only a real avatar (see below), never the wash.
    const avatarSize = Math.min(base, cap)
    let size: number
    let haloSize = 0
    let haloAlpha = 0
    if (dim) {
      size = 4
    } else if (isFocus) {
      size = Math.min(base * FOCUS_GROW, cap)
      haloSize = base * HALO_FOCUS_SCALE
      haloAlpha = HALO_ALPHA_FOCUS
    } else if (isNeighbor) {
      size = Math.min(base, cap)
      haloSize = base * HALO_NB_SCALE
      haloAlpha = HALO_ALPHA_NB
    } else if (lodTier === 0) {
      // Overview: a constant-screen-size dot drawn from the flat cluster color
      // (no atlas texture). The wash is kept so community structure reads.
      size = this.nodeWorldForRadius(LOD_DOT_R_PX)
      haloSize = avatarSize * HALO_SCALE
      haloAlpha = HALO_ALPHA
    } else if (lodTier === 1) {
      // Mid: small avatars, capped below the Detail ceiling.
      size = Math.min(base, this.nodeWorldForRadius(AVATAR_MID_R_PX))
      haloSize = size * HALO_SCALE
      haloAlpha = HALO_ALPHA
    } else {
      size = avatarSize
      haloSize = size * HALO_SCALE
      haloAlpha = HALO_ALPHA
    }

    // Hover swell: only a real avatar grows (Mid/Detail, not a dim dot). The
    // halo was sized from the resting avatar above, so it stays put; the small
    // overshoot past the resting ceiling keeps the full 8% visible even when the
    // avatar is already capped. Overview keeps its constant dot, and selection
    // suppresses `hovered`, so neither swells here.
    if (hovered && !dim && lodTier >= 1) size *= HOVER_GROW

    // Overview replaces avatars with cluster-colored dots. Selection/search
    // force lodTier 2 above, so those nodes never become dots here.
    const isDot = lodTier === 0 && !dim
    const opaqueColor = dim
      ? COLORS.dim
      : isDot
        ? attrs.clusterColor ?? '#693CF3'
        : attrs.avatarKind === 'none'
          ? attrs.avatarColor ?? '#693CF3'
          : COLORS.surface

    // Labels: Overview names nothing, Mid names only bridges / top-30 /
    // most-connected members, Detail names every visible member. Hovering a
    // member always reveals its own name (at any LOD), and selected / search-hit
    // members are always labelled. The grid prunes collisions as before, but
    // hovered/selected/hit labels are forced past it. Size stays 12px; emphasis
    // (hover / selection / search hit) bumps the weight to semi-bold.
    const typo = readLabelTypography()
    const hot = selected || hovered || (q && hit)
    const importantLabel = lodTier === 1 && labelable
    const showLabel = !dim && (lodTier >= 2 || importantLabel || hovered)
    const forceLabel = hot || importantLabel || (lodTier >= 2 && important)

    return {
      x: attrs.x,
      y: attrs.y,
      size,
      color: opaqueColor,
      label: showLabel ? attrs.name : '',
      labelWeight: hot ? typo.weightSemibold : typo.weightRegular,

      avatarKey: dim || isDot ? '' : (attrs.avatarKey ?? ''),
      haloColor: attrs.haloColor ?? attrs.clusterColor ?? '#693CF3',
      haloSize,
      haloAlpha,
      filterOutLabel: false,
      ring,
      ringWidth,
      forceLabel,
      zIndex: selected ? 3 : q && hit ? 1 : undefined,
    }
  }

  private edgeReducer(edge: string, data: DisplayEdge): Partial<DisplayEdge> {
    const attrs = this.graph.getEdgeAttributes(edge)
    const focusId = this.focus()
    const q = this.searchQuery.trim().toLowerCase()
    // Sigma's edge reducer only receives (edge, data); endpoint ids come
    // from the graph directly, but only when focus or search needs them —
    // extremities lookups over every edge on every rest refresh add up.
    let sId = ''
    let tId = ''
    if (focusId || q) {
      ;[sId, tId] = this.graph.extremities(edge)
    }

    let sourceHit = false
    let targetHit = false
    if (q) {
      const sa = this.graph.getNodeAttributes(sId)
      const ta = this.graph.getNodeAttributes(tId)
      sourceHit = (sa.name ?? '').toLowerCase().includes(q) || (sa.username ?? '').toLowerCase().includes(q)
      targetHit = (ta.name ?? '').toLowerCase().includes(q) || (ta.username ?? '').toLowerCase().includes(q)
    }

    // Ego-focus (Marvel's click model, driven by SELECTION only): only the
    // selected member's own connections stay, strength-colored at constant
    // width; everything else hides. Hover never affects edges.
    if (focusId) {
      const incident = sId === focusId || tId === focusId
      if (!incident) return { hidden: true, size: 0 }
      if (!filterAllows(this.filter, attrs.label)) return { hidden: true, size: 0 }
      if (q && !(sourceHit || targetHit)) return { hidden: true, size: 0 }
      return {
        hidden: false,
        color: STRENGTH_COLOR[attrs.label],
        size: this.edgeWorldFor(STRENGTH_W),
        label: '',
      }
    }

    // Rest: faint gray community web at constant width, zoom-graduated count
    // (fit shows the spine, deeper zoom reveals more).
    const k = 1 / this.sigma.getCamera().ratio
    const budget = k < REVEAL_K1 ? this.edgeBudgetFit : k < REVEAL_K2 ? this.edgeBudgetMid : this.edgeBudgetDeep
    if (attrs.rank >= budget) {
      return { hidden: true, size: 0 }
    }

    if (!filterAllows(this.filter, attrs.label)) {
      return { hidden: true, size: 0 }
    }
    if (q && !(sourceHit || targetHit)) {
      return { hidden: false, color: COLORS.faint, size: this.edgeWorldFor(1.0), label: '' }
    }
    // Overview keeps the relationship web but pushes it further into the
    // background so the cluster dots stay legible; Mid/Detail use the default
    // web. Only colour/width change — every edge still obeys the same budget.
    if (k < REVEAL_K1) {
      return { hidden: false, color: COLORS.faint, size: this.edgeWorldFor(1.0), label: '' }
    }
    return { hidden: false, color: COLORS.edgeDefault, size: this.edgeWorldFor(EDGE_W_DEFAULT), label: '' }
  }

  // --- Sigma events --------------------------------------------------------

  private bindCamera(): void {
    this.sigma.getCamera().on('updated', ({ ratio }) => {
      const ratioChanged = ratio !== this.camRatio
      this.camRatio = ratio
      this.scaleBase = this.sigma.scaleSize(1)
      const k = 1 / ratio
      const tier = k < REVEAL_K1 ? 0 : k < REVEAL_K2 ? 1 : 2
      if (tier !== this.revealTier) {
        this.revealTier = tier
        this.sigma.refresh()
      } else if (ratioChanged) {
        // Node/edge world sizes derive their screen size from the scale
        // captured above, so a stale snapshot lets capped avatars drift off
        // their ceiling between refreshes and then snap when the next hover
        // refresh recomputes them. Recompute on ratio changes too, coalesced
        // to at most one reprocess per frame.
        this.sigma.scheduleRefresh()
      }
    })
  }

  private bindCaptors(): void {
    const sigma = this.sigma

    sigma.on('enterNode', ({ node }) => {
      // A member is clickable, so signal it with the pointer cursor. This is
      // independent of the visual hover state (which selection suppresses).
      this.memberCursor(true)
      // While a member is selected, hover is fully suppressed: moving over
      // another member must not change focus, labels, node states or edges.
      if (this.selectedId !== null) return
      this.setHovered(node)
    })
    sigma.on('leaveNode', () => {
      this.memberCursor(false)
      this.setHovered(null)
    })
    // Guard: if the pointer leaves the canvas straight off a node, reset the
    // cursor so the member-pointer state can't stick.
    sigma.on('leaveStage', () => {
      this.memberCursor(false)
    })

    sigma.on('clickNode', ({ node, event }) => {
      event.preventSigmaDefault()
      this.handlers.onSelect(node)
    })
    sigma.on('clickStage', () => {
      this.handlers.onSelect(null)
    })
    // Double-click fits the view anywhere (members are not draggable).
    sigma.on('doubleClickNode', ({ event }) => {
      event.preventSigmaDefault()
      this.fit()
    })
    sigma.on('doubleClickStage', ({ event }) => {
      event.preventSigmaDefault()
      this.fit()
    })
  }
}

export type { NodeAttrs, EdgeAttrs }