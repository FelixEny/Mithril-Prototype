import type { LayoutResult, MemberSpec, Pt } from './types'

// Deterministic, community-aware layout: cluster centroids are distributed on
// an ellipse (larger clusters first), members are seeded around their cluster
// centroid, then a short force simulation runs using a seeded Barnes-Hut
// approximation for repulsion plus edge springs and a weak centroid pull.
//
// The whole run is fully deterministic (same inputs => byte-identical result),
// so the result can be cached per population and gate determinism checks.

const W = 1000
const H = 475
const PAD = 26
const MAX_DEPTH = 16

const mulberry32 = (seed: number) => () => {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// --- Quadtree --------------------------------------------------------------

interface BHNode {
  w: number
  x: number
  y: number
  mass: number
  cmx: number
  cmy: number
  body?: number
  children?: (number | 0)[]
}

function newNode(x: number, y: number, w: number): BHNode {
  return { w, x, y, mass: 0, cmx: 0, cmy: 0 }
}

function insertIntoTree(
  pool: BHNode[],
  nodeIndex: number,
  node: BHNode,
  x: number,
  y: number,
  body: number,
  depth: number,
): void {
  if (depth >= MAX_DEPTH) return
  if (node.body === undefined && !node.children) {
    node.body = body
    return
  }
  if (!node.children) node.children = [0, 0, 0, 0]
  const q = (x < node.x + node.w / 2 ? 0 : 2) | (y < node.y + node.w / 2 ? 0 : 1)
  const qx = q & 2
  const qy = q & 1
  if (node.children[q]) {
    insertIntoTree(pool, node.children[q] as number, pool[node.children[q] as number], x, y, body, depth + 1)
    return
  }
  const child = newNode(node.x + (qx ? node.w / 2 : 0), node.y + (qy ? node.w / 2 : 0), node.w / 2)
  node.children[q] = pool.length
  pool.push(child)
  insertIntoTree(pool, pool.length - 1, child, x, y, body, depth + 1)
}

// --- Layout engine ---------------------------------------------------------

export function runLayout(
  members: MemberSpec[],
  edges: { a: string; b: string }[],
  iterations = Math.min(90, 40 + Math.ceil(members.length / 60)),
): LayoutResult {
  const order = members.length
  const index = new Map<string, number>()
  members.forEach((m, i) => index.set(m.id, i))

  // 1. Seeded placement around cluster centroids.
  const byCluster = new Map<number, string[]>()
  for (const m of members) {
    const arr = byCluster.get(m.clusterId)
    if (arr) arr.push(m.id)
    else byCluster.set(m.clusterId, [m.id])
  }
  const band = (m: MemberSpec) => (m.bridge ? 1 : m.degree > 0 ? 0 : 2)

  const rand = mulberry32(42)
  const cx = W / 2
  const cy = H / 2
  const centroids = new Map<number, Pt>()
  const clusters = [...byCluster.keys()].sort((a, b) => (byCluster.get(b)?.length ?? 0) - (byCluster.get(a)?.length ?? 0))
  clusters.forEach((c, i) => {
    if (c === -1) return
    const a = (i / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2
    const r = Math.min(W, H) * 0.32
    centroids.set(c, { x: cx + Math.cos(a) * r * 1.25, y: cy + Math.sin(a) * r })
  })
  centroids.set(-1, { x: cx, y: cy })

  const seedPos = new Map<string, Pt>()
  for (const [c, ids] of byCluster) {
    const cent = centroids.get(c)!
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i]
      const b = band(members[index.get(id)!])
      const a = (i % 13) * 2.39996 + (rand() - 0.5) * 0.7
      if (c === -1) {
        const r = 150 + (i % 7) * 28
        seedPos.set(id, { x: cent.x + Math.cos(a) * r * 1.3, y: cent.y + Math.sin(a) * r })
      } else {
        const spread = Math.max(66, Math.sqrt(ids.length) * 26)
        const r = spread * (0.72 + (b === 0 ? 0 : b === 1 ? 0.38 : 1.05) * Math.sqrt((i + 0.5) / ids.length))
        seedPos.set(id, { x: cent.x + Math.cos(a) * r, y: cent.y + Math.sin(a) * r * 0.85 })
      }
    }
  }

  const pos = new Float64Array(order * 2)
  for (let i = 0; i < order; i++) {
    const p = seedPos.get(members[i].id)!
    pos[i * 2] = p.x
    pos[i * 2 + 1] = p.y
  }
  const mass = new Float64Array(order)
  for (let i = 0; i < order; i++) mass[i] = 1 + members[i].degree / 22

  const forces = new Float64Array(order * 2)

  const REPULSION = 780
  const REP_EPS = 110
  const SPRING = 0.016
  const REST_LEN = 27
  const CENTROID_PULL = 0.03
  const DAMPING = 0.84
  const MAX_STEP = 26
  const THETA = 0.85
  const MAX_RADIUS = 430

  for (let iter = 0; iter < iterations; iter++) {
    // Build the quadtree.
    const pool: BHNode[] = [newNode(0, 0, W)]
    for (let i = 0; i < order; i++) {
      insertIntoTree(pool, 0, pool[0], pos[i * 2], pos[i * 2 + 1], i, 0)
    }

    // Accumulate center-of-mass, bottom-up.
    for (let i = pool.length - 1; i >= 0; i--) {
      const n = pool[i]
      if (n.body !== undefined) {
        const b = n.body
        n.mass = mass[b]
        n.cmx = pos[b * 2]
        n.cmy = pos[b * 2 + 1]
      } else if (n.children) {
        let m = 0
        let sx = 0
        let sy = 0
        for (let k = 0; k < 4; k++) {
          const ci = n.children[k]
          if (!ci) continue
          const c = pool[ci as number]
          m += c.mass
          sx += c.cmx * c.mass
          sy += c.cmy * c.mass
        }
        n.mass = m
        n.cmx = m ? sx / m : 0
        n.cmy = m ? sy / m : 0
      }
    }

    // Repulsion via Barnes-Hut traversal.
    const stacks: number[] = []
    for (let i = 0; i < order; i++) {
      const px = pos[i * 2]
      const py = pos[i * 2 + 1]
      let fx = 0
      let fy = 0
      stacks[0] = 0
      let sp = 1
      while (sp > 0) {
        const n = pool[stacks[--sp]]
        if (!n.mass) continue
        const dx = px - n.cmx
        const dy = py - n.cmy
        const d2 = dx * dx + dy * dy
        if (n.children && n.w * n.w < d2 * THETA * THETA) {
          const d = Math.sqrt(d2) || 1
          const f = (REPULSION * n.mass) / (d2 + REP_EPS)
          fx += (dx / d) * f
          fy += (dy / d) * f
          continue
        }
        if (n.children) {
          for (let k = 3; k >= 0; k--) {
            const ci = n.children[k]
            if (ci) stacks[sp++] = ci as number
          }
          continue
        }
        if (n.body === i) continue
        const d = Math.sqrt(d2) || 1
        const f = (REPULSION * n.mass) / (d2 + REP_EPS)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }

      const m = members[i]
      const cent = centroids.get(m.clusterId) ?? centroids.get(-1)!
      fx += (cent.x - px) * CENTROID_PULL
      fy += (cent.y - py) * CENTROID_PULL
      forces[i * 2] = fx
      forces[i * 2 + 1] = fy
    }

    // Springs along edges.
    for (let e = 0, l = edges.length; e < l; e++) {
      const ai = index.get(edges[e].a)!
      const bi = index.get(edges[e].b)!
      if (ai === bi) continue
      const dx = pos[bi * 2] - pos[ai * 2]
      const dy = pos[bi * 2 + 1] - pos[ai * 2 + 1]
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - REST_LEN) * SPRING
      const ux = dx / d
      const uy = dy / d
      forces[ai * 2] += ux * f
      forces[ai * 2 + 1] += uy * f
      forces[bi * 2] -= ux * f
      forces[bi * 2 + 1] -= uy * f
    }

    // Integrate with damping + step clamp.
    let maxMove = 0
    for (let i = 0; i < order; i++) {
      let fx = forces[i * 2]
      let fy = forces[i * 2 + 1]
      const len = Math.sqrt(fx * fx + fy * fy)
      if (len > MAX_STEP) {
        fx = (fx / len) * MAX_STEP
        fy = (fy / len) * MAX_STEP
      }
      let nx = pos[i * 2] + fx * DAMPING
      let ny = pos[i * 2 + 1] + fy * DAMPING
      const m = members[i]
      const c = centroids.get(m.clusterId) ?? centroids.get(-1)!
      const d = Math.sqrt((nx - c.x) ** 2 + (ny - c.y) ** 2)
      if (d > MAX_RADIUS) {
        nx = c.x + ((nx - c.x) / d) * MAX_RADIUS
        ny = c.y + ((ny - c.y) / d) * MAX_RADIUS
      }
      nx = Math.min(W - PAD, Math.max(PAD, nx))
      ny = Math.min(H - PAD, Math.max(PAD, ny))
      const move = Math.abs(nx - pos[i * 2]) + Math.abs(ny - pos[i * 2 + 1])
      if (move > maxMove) maxMove = move
      pos[i * 2] = nx
      pos[i * 2 + 1] = ny
    }
    if (maxMove < 0.08) break
  }

  const positions = new Map<string, Pt>()
  for (let i = 0; i < order; i++) {
    positions.set(members[i].id, { x: pos[i * 2], y: pos[i * 2 + 1] })
  }
  return { positions, centroids }
}