import { Sigma } from 'sigma'
import Graph from 'graphology'
import { createNodeCompoundProgram } from 'sigma/rendering'
import { buildPopulation, avatarAttrsOf, clusterColorOf, type MemberFilterLike } from './build'
import { MemberAtlas, avatarSpecFor, avatarKeyOf, type AvatarSpec } from './textures'
import { createMemberNodeProgram } from './programs/node'
import { NodeHaloProgram } from './programs/halo'
import type { RelationshipsData, StrengthLabel } from '../relationships'

export type GraphFilter = 'all' | 'strong' | 'mid' | 'weak'

export const WORLD_W = 1000
export const WORLD_H = 475

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

// Zoom-graduated edge reveal by k = 1 / camera.ratio. Only the COUNT changes
// with zoom — every visible edge holds a constant screen width, so zooming
// reveals detail instead of growing chunky lines.
const REVEAL_K1 = 2.1
const REVEAL_K2 = 3.5
const EDGE_BUDGET_FIT = 2500
const EDGE_BUDGET_MID_CAP = 6000
const EDGE_BUDGET_DEEP_CAP = 12000

// Constant screen widths (css px) — the edge reducer converts these to world
// sizes every refresh, cancelling sigma's zoom growth exactly.
const EDGE_W: Record<'default' | StrengthLabel, number> = { default: 1.1, strong: 2.2, mid: 1.5, weak: 1.0 }

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
  faint: '#E8EAF3',
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
const STRENGTH_PX: Record<StrengthLabel, number> = { strong: 2.2, mid: 1.5, weak: 1.0 }

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

export interface GraphEngineHandlers {
  onSelect: (id: string | null) => void
  onHover?: (id: string | null, pos: { x: number; y: number } | null) => void
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
  avatarKind?: 'none' | 'photo'
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
  private suppressClickUntil = 0
  private drag: { node: string; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null = null
  // Original layout positions per node id, snapshotted at population build so
  // a dragged member can be returned home by double-clicking it.
  private homePos = new Map<string, { x: number; y: number }>()
  private dragged = new Set<string>()

  private resizeObserver: ResizeObserver | null = null

  constructor(container: HTMLElement, data: RelationshipsData, handlers: GraphEngineHandlers) {
    this.container = container
    this.data = data
    this.handlers = handlers
    this.atlas = new MemberAtlas()

    this.memberClass = createMemberNodeProgram(this.atlas)
    // Halos render as the first sub-program of the same node draw pass, so
    // every wash sits underneath every avatar (Marvel's compound pattern).
    // The hover layer keeps the bare member program so the focused member
    // doesn't get a doubled halo.
    this.programClass = createNodeCompoundProgram([NodeHaloProgram, this.memberClass])

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
      labelFont: '"Inter", "Geist", system-ui, -apple-system, sans-serif',
      labelWeight: '400',
      labelSize: 12,
      labelHoveredSizeRatio: 1,
      defaultNodeColor: '#693CF3',
    }

    this.sigma = new Sigma(this.graph, container, settings as any)

    this.camRatio = this.sigma.getCamera().ratio
    this.scaleBase = this.sigma.scaleSize(1)

    this.bindCaptors()
    this.bindCamera()
    // Keep the hover pill pinned to its member through camera moves.
    this.sigma.on('afterRender', () => {
      this.repositionPill()
    })
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

    // Atlas: claim + bake initials synchronously; photos decode async.
    this.atlas = new MemberAtlas()
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
      }, 150)
    })

    // Graph: nodes + attributed edges (rank by score desc).
    const graph = new Graph<NodeAttrs, EdgeAttrs>()
    this.homePos = new Map()
    this.dragged = new Set()
    for (const m of pop.members) {
      const info = this.data.memberInfo.get(m.id)
      const p = pop.positioned.get(m.id)
      if (!info || !p) continue
      const av = avatarAttrsOf(m.id)
      const clusterColor = clusterColorOf(m.clusterId)
      this.homePos.set(m.id, { x: p.x, y: p.y })
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
    // reference a node that no longer exists).
    if (this.hoveredId) {
      this.hoveredId = null
      this.handlers.onHover?.(null, null)
    }
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

  restore(id: string): boolean {
    if (!this.graph.hasNode(id)) return false
    const home = this.homePos.get(id)
    if (!home) return false
    const attrs = this.graph.getNodeAttributes(id)
    if (Math.abs(attrs.x - home.x) + Math.abs(attrs.y - home.y) < 0.001) return false
    this.graph.mergeNodeAttributes(id, { x: home.x, y: home.y })
    this.dragged.delete(id)
    this.sigma.refresh()
    return true
  }

  destroy(): void {
    if (this.photoRebuildTimer) {
      clearTimeout(this.photoRebuildTimer)
      this.photoRebuildTimer = null
    }
    this.resizeObserver?.disconnect()
    this.sigma.kill()
  }

  getGraph(): Graph<NodeAttrs, EdgeAttrs> {
    return this.graph
  }

  getSigma(): Sigma<NodeAttrs, EdgeAttrs> {
    return this.sigma
  }

  // --- Hover pill -----------------------------------------------------------

  private motionMs(ms: number): number {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0
    }
    return ms
  }

  /** Push the current hover's screen position to React so the name pill tracks
   *  the member through camera moves and tier refreshes. */
  private repositionPill(): void {
    const id = this.hoveredId
    if (!id || !this.graph.hasNode(id)) return
    const attrs = this.graph.getNodeAttributes(id)
    const vp = this.sigma.graphToViewport({ x: attrs.x, y: attrs.y })
    this.handlers.onHover?.(id, { x: vp.x, y: vp.y })
  }

  // --- Reducers ------------------------------------------------------------

  private focus(): string | null {
    return this.hoveredId ?? this.selectedId
  }

  private neighborsOf(id: string): Set<string> {
    let nb = this.nbsCache.get(id)
    if (nb) return nb
    nb = new Set<string>()
    const graph = this.graph
    graph.forEachOutboundEdge(id, (edge, _attrs, srcKey, tgtKey) => {
      nb.add(srcKey === id ? tgtKey : srcKey)
    })
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
      if (q && !hit) return false
      if (focusId && node !== focusId && !this.neighborsOf(focusId).has(node)) return false
      return true
    })()

    const dim = !m
    const base = sizeForDegree(attrs.degree)
    const cap = this.nodeWorldForRadius(AVATAR_MAX_R_PX)

    const selected = node === this.selectedId
    const hovered = node === this.hoveredId
    const important = this.importantIds.has(node)
    const isFocus = focusId !== null && node === focusId
    const nbs = focusId !== null && !isFocus ? this.neighborsOf(focusId) : null
    const isNeighbor = nbs !== null && nbs.has(node)

    // Ring: selected > hovered > search hit > bridge.
    let ring: [number, number, number, number] | null = null
    let ringWidth = 0
    if (selected || hovered || (q && hit)) {
      ring = [0x69 / 255, 0x3c / 255, 0xf3 / 255, 1]
      ringWidth = 2.5
    } else if (attrs.bridge) {
      ring = [0x00 / 255, 0x9a / 255, 0x47 / 255, 1]
      ringWidth = 1.8
    }

    // Size + halo follow Marvel's focus model: rest members carry a soft
    // 5x cluster wash; the focused member grows (under the ceiling) with a
    // strong halo; neighbors keep a medium wash; everyone else collapses to
    // a faint dot with no halo.
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
    } else {
      size = Math.min(base, cap)
      haloSize = size * HALO_SCALE
      haloAlpha = HALO_ALPHA
    }

    const opaqueColor = dim
      ? COLORS.dim
      : attrs.avatarKind === 'none'
        ? attrs.avatarColor ?? '#693CF3'
        : COLORS.surface

    // Labels: every visible member is named (the grid prunes collisions);
    // focused/important members force theirs. Size stays 12px at any zoom.
    const hot = selected || hovered || (q && hit) || important
    const forceLabel = hot

    return {
      x: attrs.x,
      y: attrs.y,
      size,
      color: opaqueColor,
      label: dim ? '' : attrs.name,

      avatarKey: dim ? '' : (attrs.avatarKey ?? ''),
      haloColor: attrs.haloColor ?? attrs.clusterColor ?? '#693CF3',
      haloSize,
      haloAlpha,
      filterOutLabel: false,
      ring,
      ringWidth,
      forceLabel,
      zIndex: selected ? 3 : hovered ? 2 : q && hit ? 1 : undefined,
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

    // Ego-focus (Marvel's click model, driven by hover OR selection): only
    // the focused member's own connections stay, strength-colored at
    // constant width; everything else hides.
    if (focusId) {
      const incident = sId === focusId || tId === focusId
      if (!incident) return { hidden: true, size: 0 }
      if (!filterAllows(this.filter, attrs.label)) return { hidden: true, size: 0 }
      if (q && !(sourceHit || targetHit)) return { hidden: true, size: 0 }
      return {
        hidden: false,
        color: STRENGTH_COLOR[attrs.label],
        size: this.edgeWorldFor(STRENGTH_PX[attrs.label]),
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
    return { hidden: false, color: COLORS.edgeDefault, size: this.edgeWorldFor(EDGE_W.default), label: '' }
  }

  // --- Sigma events --------------------------------------------------------

  private bindCamera(): void {
    this.sigma.getCamera().on('updated', ({ ratio }) => {
      this.camRatio = ratio
      this.scaleBase = this.sigma.scaleSize(1)
      const k = 1 / ratio
      const tier = k < REVEAL_K1 ? 0 : k < REVEAL_K2 ? 1 : 2
      if (tier !== this.revealTier) {
        this.revealTier = tier
        this.sigma.refresh()
      }
    })
  }

  private bindCaptors(): void {
    const sigma = this.sigma

    sigma.on('enterNode', ({ node }) => {
      this.setHovered(node)
      this.repositionPill()
    })
    sigma.on('leaveNode', () => {
      this.setHovered(null)
      this.handlers.onHover?.(null, null)
    })

    sigma.on('clickNode', ({ node, event }) => {
      event.preventSigmaDefault()
      if (Date.now() < this.suppressClickUntil) return
      this.handlers.onSelect(node)
    })
    sigma.on('clickStage', () => {
      this.handlers.onSelect(null)
    })
    sigma.on('doubleClickNode', ({ node, event }) => {
      event.preventSigmaDefault()
      // Any dragged node can be returned home by double-clicking it.
      this.restore(node)
    })
    sigma.on('doubleClickStage', () => {
      this.fit()
    })

    // Node dragging.
    sigma.on('downNode', (e) => {
      e.preventSigmaDefault()
      const attrs = sigma.getGraph().getNodeAttributes(e.node)
      this.drag = { node: e.node, sx: e.event.x, sy: e.event.y, ox: attrs.x, oy: attrs.y, moved: false }
      sigma.setCustomBBox(sigma.getBBox())
    })
    sigma.on('moveBody', (e) => {
      const d = this.drag
      if (!d) return
      e.preventSigmaDefault()
      const p = sigma.viewportToGraph({ x: e.event.x, y: e.event.y })
      if (Math.abs(p.x - d.ox) + Math.abs(p.y - d.oy) > 2) {
        d.moved = true
        this.dragged.add(d.node)
      }
      const node = d.node
      const clamped = {
        x: Math.min(WORLD_W - 8, Math.max(8, p.x)),
        y: Math.min(WORLD_H - 8, Math.max(8, p.y)),
      }
      if (sigma.getGraph().hasNode(node)) {
        sigma.getGraph().mergeNodeAttributes(node, clamped)
      }
    })
    const endDrag = () => {
      const d = this.drag
      this.drag = null
      sigma.setCustomBBox(null)
      if (d?.moved) {
        this.suppressClickUntil = Date.now() + 400
      }
    }
    sigma.on('upNode', endDrag)
    sigma.on('upStage', endDrag)
    sigma.on('leaveStage', endDrag)
  }
}

export type { NodeAttrs, EdgeAttrs }