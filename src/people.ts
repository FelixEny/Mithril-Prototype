import { startDate, endDate, members, roles, messages, voiceSessions, reactions, presentAt } from './data'
import type { Role } from './data'
import { activitySnapshot, type ActivitySnapshot, type ActivityTier } from './analytics'
import { influenceEngine } from './relationships'

// People table row model. Everything the People page renders is derived here
// once, deterministically, from the shared corpus so the same member reads the
// same way everywhere in the product.
export interface PeopleRow {
  id: string
  name: string
  username: string | null
  tier: ActivityTier
  influence: number
  roleIds: string[]
  roles: Role[]
  joinedAtMs: number
  lastActiveAtMs: number
  series: number[]
}

const DAY = 86400000
const WEEK = 7 * DAY

let roleById: Map<string, Role> | null = null
function roleOf(id: string): Role {
  if (!roleById) roleById = new Map(roles.map((r) => [r.id, r]))
  return roleById.get(id) ?? { id, name: id, color: 'var(--content-tertiary)' }
}

// Members with no qualifying network interactions (no replies/reactions either
// way) have no entry in the relationship engine. Fall back to a small
// activity-derived score so every row still has a number.
const fallbackInfluence = (s: ActivitySnapshot | undefined): number => {
  if (!s) return 0
  return Math.min(22, Math.round(Math.log1p(s.messages) * 2 + Math.log1p(s.reactionsReceived) + Math.log1p(s.voiceMinutes / 60) + s.activeDays * 0.3))
}

let cache: PeopleRow[] | null = null
export function peopleRows(): PeopleRow[] {
  if (cache) return cache
  const startMs = startDate.getTime()
  const endMs = endDate.getTime()
  const bucketCount = Math.max(1, Math.ceil((endMs - startMs) / WEEK))
  const bucketOf = (ms: number) => Math.min(bucketCount - 1, Math.max(0, Math.floor((ms - startMs) / WEEK)))

  const bump = (map: Map<string, number[]>, id: string, ms: number) => {
    if (ms < startMs || ms > endMs) return
    let arr = map.get(id)
    if (!arr) { arr = new Array(bucketCount).fill(0); map.set(id, arr) }
    arr[bucketOf(ms)]++
  }
  const counts = new Map<string, number[]>()
  for (const m of messages) bump(counts, m.memberId, m.at.getTime())
  for (const v of voiceSessions) bump(counts, v.memberId, v.at.getTime())
  for (const r of reactions) bump(counts, r.memberId, r.at.getTime())

  const snap = activitySnapshot(endDate)
  const network = influenceEngine().memberInfo

  // The table is the roster at the data end, same line every other surface
  // draws: bots are out (presentAt excludes them), and so is anyone who has
  // left. Departures are the Overview / Community Snapshot's story — a
  // departed member with no chip or grey-out would just read as quiet.
  cache = members
    .filter((m) => presentAt(m, endDate))
    .map((m) => {
      const s = snap.get(m.id)
      return {
        id: m.id,
        name: m.name,
        username: m.username ?? null,
        tier: s?.tier ?? 'Inactive',
        influence: Math.round(network.get(m.id)?.influence ?? fallbackInfluence(s)),
        roleIds: m.roles ?? [],
        roles: (m.roles ?? []).map(roleOf),
        joinedAtMs: m.joinedAt.getTime(),
        lastActiveAtMs: s?.lastActiveAtMs ?? -Infinity,
        series: counts.get(m.id) ?? [],
      }
    })
  return cache
}