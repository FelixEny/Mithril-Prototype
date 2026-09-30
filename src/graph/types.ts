import type { StrengthLabel } from '../relationships'

export interface Pt {
  x: number
  y: number
}

// Node attributes stored on the graphology graph. x/y live here in the stable
// world coordinate system ([0, WIDTH] x [0, HEIGHT]); sigma normalizes them
// internally when rendering.
export interface GraphNodeAttrs {
  x: number
  y: number
  // Name used for the label and the search index.
  label: string
  // Raw member metadata needed by the renderer's reducers.
  name: string
  degree: number
  influence: number
  clusterId: number
  bridge: boolean
  mostConnected: boolean
  // Avatar identity (stable across screens): a canonical key into the baked
  // texture atlas plus the info needed to derive fallbacks.
  avatarKey: string
  avatarKind: 'none' | 'photo'
  avatarColor: string
  // Tint used for the lightweight "dot" representation at overview zoom.
  clusterColor: string
}

// Edge attributes. rank = position when the population's edges are sorted by
// score descending (0 = strongest), used for the viewport-capping tiers.
export interface GraphEdgeAttrs {
  label: StrengthLabel
  score: number
  rank: number
}

export interface LayoutResult {
  positions: Map<string, Pt>
  centroids: Map<number, Pt>
}

export interface MemberSpec {
  id: string
  name: string
  degree: number
  influence: number
  clusterId: number
  bridge: boolean
  mostConnected: boolean
}

export interface Population {
  members: MemberSpec[]
  edges: { a: string; b: string; score: number; label: StrengthLabel }[]
}