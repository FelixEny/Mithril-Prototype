import type { ActivityTier } from './analytics'

// Role Count — comparison operators for "how many Discord roles does this
// member hold?" Kept as data (not prose) so the filter menu, segment criteria
// and tests all read from one vocabulary.
export type RoleCountOp = 'exactly' | 'more-than' | 'at-least' | 'fewer-than' | 'at-most'

export const ROLE_COUNT_OPS: { value: RoleCountOp; label: string }[] = [
  { value: 'exactly', label: 'Exactly' },
  { value: 'more-than', label: 'More than' },
  { value: 'at-least', label: 'At least' },
  { value: 'fewer-than', label: 'Fewer than' },
  { value: 'at-most', label: 'At most' },
]

export interface RoleCountFilter {
  op: RoleCountOp
  value: number
}

// Discord's default @everyone role is assigned to every member by definition,
// so counting it would make every member's total the same. Ids arrive from the
// corpus as plain role ids, but accept '@everyone'/'everyone' in any case so a
// future data refresh that includes it stays correct.
const isEveryone = (id: string) => id.trim().toLowerCase().replace(/^@/, '') === 'everyone'

// Qualifying role count: duplicates collapsed (Discord role ids are unique per
// member in practice, but a Set makes the promise structural) and @everyone
// excluded.
export function roleCountOf(roleIds: readonly string[] | undefined): number {
  if (!roleIds || roleIds.length === 0) return 0
  const unique = new Set<string>()
  for (const id of roleIds) {
    if (isEveryone(id)) continue
    unique.add(id)
  }
  return unique.size
}

export function matchesRoleCount(count: number, op: RoleCountOp, value: number): boolean {
  switch (op) {
    case 'exactly': return count === value
    case 'more-than': return count > value
    case 'at-least': return count >= value
    case 'fewer-than': return count < value
    case 'at-most': return count <= value
  }
}

// The minimal shape the People page's filter pipeline needs. PeopleRow extends
// it structurally, and tests can build rows straight from members.json without
// pulling in the heavy activity corpus.
export interface FilterableRow {
  id: string
  name: string
  username?: string | null
  tier: ActivityTier
  influence: number
  roleIds: readonly string[]
}

export interface PeopleFilters {
  search?: string
  segIds?: ReadonlySet<string> | null
  watchIds?: ReadonlyMap<string, unknown> | null
  tiers?: readonly ActivityTier[]
  roleSel?: readonly string[]
  minInf?: number | null
  roleCount?: RoleCountFilter | null
}

// One pass over the rows; every active filter must pass (AND), matching the
// People page's existing combination semantics.
export function applyPeopleFilters<T extends FilterableRow>(rows: readonly T[], f: PeopleFilters): T[] {
  const q = (f.search ?? '').trim().toLowerCase()
  const out: T[] = []
  for (const r of rows) {
    if (f.segIds && !f.segIds.has(r.id)) continue
    if (f.watchIds && !f.watchIds.has(r.id)) continue
    if (f.tiers && f.tiers.length && !f.tiers.includes(r.tier)) continue
    if (f.roleSel && f.roleSel.length && !r.roleIds.some((id) => f.roleSel!.includes(id))) continue
    if (f.minInf !== null && f.minInf !== undefined && r.influence < f.minInf) continue
    if (f.roleCount && !matchesRoleCount(roleCountOf(r.roleIds), f.roleCount.op, f.roleCount.value)) continue
    if (q && !(r.name.toLowerCase().includes(q) || (r.username ?? '').toLowerCase().includes(q))) continue
    out.push(r)
  }
  return out
}
