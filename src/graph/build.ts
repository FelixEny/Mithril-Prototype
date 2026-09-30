import { avatarSpecFor, avatarKeyFor, avatarKeyOf } from './textures'
import type { MemberRelInfo, RelationshipsData, StrengthLabel } from '../relationships'
import { runLayout } from './layout'
import type { MemberSpec, Population } from './types'

// Builds the single stable "population" graph for the Relationship page:
// every filtered member (degree > 0, cluster + min-degree filters) is always
// present, along with the edges between them. Layout comes from the
// deterministic force engine and is memoized per member-id list, so repeated
// mounts and strength-filter toggles are cheap and byte-identical.

export interface PopulationNodeAttrs {
  x: number
  y: number
  label: string
  name: string
  degree: number
  influence: number
  clusterId: number
  bridge: boolean
  mostConnected: boolean
  avatarKey: string
  avatarKind: 'none' | 'photo'
  avatarColor: string
  clusterColor: string
}

export interface PopulationEdgeAttr {
  label: StrengthLabel
  score: number
  rank: number
}

export type MemberFilterLike = { cluster: number | null; minDegree: number | null }

export interface BuiltPopulation {
  members: MemberSpec[]
  edges: Population['edges']
  layoutKey: string
  positioned: Map<string, { x: number; y: number }>
  avatarKeys: string[]
}

// Deterministic cluster tints; reads as distinct neighbourhoods at overview.
const CLUSTER_COLORS = [
  '#693CF3',
  '#00B8D9',
  '#FDAB00',
  '#FF3838',
  '#42BB00',
  '#FF7A00',
  '#22A06B',
  '#A78BFA',
  '#F472B6',
  '#10B981',
]

export const clusterColorOf = (clusterId: number): string =>
  CLUSTER_COLORS[((clusterId % CLUSTER_COLORS.length) + CLUSTER_COLORS.length) % CLUSTER_COLORS.length]

// Module-scope layout cache keyed by the sorted member-id list.
const layoutCache = new Map<string, Map<string, { x: number; y: number }>>()
const MAX_CACHE = 24

export const layoutKeyOf = (ids: string[]): string => ids.join('|')

export const avatarAttrsOf = (id: string): { avatarKey: string; avatarKind: 'none' | 'photo'; avatarColor: string } => {
  const spec = avatarSpecFor(id)
  return { avatarKey: avatarKeyOf(spec.kind, spec.color, spec.initial, spec.src), avatarKind: spec.kind, avatarColor: spec.color }
}

export function buildPopulation(data: RelationshipsData, memberFilter: MemberFilterLike): BuiltPopulation {
  // 1. Members: all with degree > 0 passing the filters, stable ordering by
  //    influence desc then id asc (deterministic iteration that follows).
  const members: MemberSpec[] = []
  for (const [id, degree] of data.degree) {
    if (degree <= 0) continue
    const info = data.memberInfo.get(id)
    if (!info) continue
    if (memberFilter.cluster !== null && info.clusterId !== memberFilter.cluster) continue
    if (memberFilter.minDegree !== null && degree < memberFilter.minDegree) continue
    members.push({
      id,
      name: info.name,
      degree,
      influence: info.influence,
      clusterId: info.clusterId,
      bridge: info.bridge,
      mostConnected: info.mostConnected,
    })
  }
  members.sort((a, b) => b.influence - a.influence || (a.id < b.id ? -1 : 1))

  // 2. Edges between population members only, then ranked by score desc.
  const inPopulation = new Set(members.map((m) => m.id))
  const wanted = new Set<string>()
  for (const edge of data.edges) {
    if (inPopulation.has(edge.a) && inPopulation.has(edge.b)) {
      const key = edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`
      wanted.add(key)
    }
  }
  const byKey = new Map<string, Population['edges'][number]>()
  for (const edge of data.edges) {
    const key = edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`
    if (wanted.has(key) && !byKey.has(key)) byKey.set(key, { a: edge.a, b: edge.b, score: edge.score, label: edge.label })
  }
  const edges = [...byKey.values()].sort((a, b) => b.score - a.score)

  const ids = members.map((m) => m.id)
  const layoutKey = layoutKeyOf(ids)

  // 3. Layout (memoized).
  let positioned = layoutCache.get(layoutKey)
  if (!positioned) {
    positioned = runLayout(members, edges).positions
    if (layoutCache.size >= MAX_CACHE) {
      const first = layoutCache.keys().next().value
      if (first !== undefined) layoutCache.delete(first)
    }
    layoutCache.set(layoutKey, positioned)
  }

  const avatarKeys: string[] = []
  for (const m of members) avatarKeys.push(avatarKeyFor(m.id))

  return { members, edges, layoutKey, positioned, avatarKeys }
}

export const nodeAttrsOf = (
  m: MemberSpec,
  info: MemberRelInfo,
  position: { x: number; y: number },
): PopulationNodeAttrs => {
  const av = avatarAttrsOf(m.id)
  return {
    x: position.x,
    y: position.y,
    label: m.name,
    name: m.name,
    degree: m.degree,
    influence: m.influence,
    clusterId: m.clusterId,
    bridge: m.bridge,
    mostConnected: m.mostConnected,
    avatarKey: av.avatarKey,
    avatarKind: av.avatarKind,
    avatarColor: av.avatarColor,
    clusterColor: clusterColorOf(m.clusterId),
  }
}