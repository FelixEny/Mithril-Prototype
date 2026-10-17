import type { ActivityTier } from './analytics'

// Comparison operators shared by the Role Count and Influence score
// conditions ("how many roles does this member hold?" / "what is this
// member's score?"). Kept as data (not prose) so the filter menu, segment
// criteria and tests all read from one vocabulary. The `fewer-than` value is
// persisted in stored segment criteria, so values are frozen — only labels
// may change.
export type CompareOp = 'exactly' | 'more-than' | 'at-least' | 'fewer-than' | 'at-most'

export const COMPARE_OPS: { value: CompareOp; label: string }[] = [
  { value: 'exactly', label: 'Exactly' },
  { value: 'more-than', label: 'More than' },
  { value: 'fewer-than', label: 'Less than' },
  { value: 'at-most', label: 'At most' },
  { value: 'at-least', label: 'At least' },
]

export interface CompareFilter {
  op: CompareOp
  value: number
}

// Influence score is a 0–100 value, so besides the shared operators it
// supports a custom inclusive range (from/to, both 0–100).
export type InfluenceFilter =
  | CompareFilter
  | { from: number; to: number }

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

export function matchesCompare(value: number, op: CompareOp, target: number): boolean {
  switch (op) {
    case 'exactly': return value === target
    case 'more-than': return value > target
    case 'at-least': return value >= target
    case 'fewer-than': return value < target
    case 'at-most': return value <= target
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
  tiers?: readonly ActivityTier[]
  roleSel?: readonly string[]
  influence?: InfluenceFilter | null
  roleCount?: CompareFilter | null
}

// One pass over the rows; every active filter must pass (AND), matching the
// People page's existing combination semantics.
export function applyPeopleFilters<T extends FilterableRow>(rows: readonly T[], f: PeopleFilters): T[] {
  const q = (f.search ?? '').trim().toLowerCase()
  const out: T[] = []
  for (const r of rows) {
    if (f.segIds && !f.segIds.has(r.id)) continue
    if (f.tiers && f.tiers.length && !f.tiers.includes(r.tier)) continue
    if (f.roleSel && f.roleSel.length && !r.roleIds.some((id) => f.roleSel!.includes(id))) continue
    if (f.influence) {
      if ('from' in f.influence) {
        if (r.influence < f.influence.from || r.influence > f.influence.to) continue
      } else if (!matchesCompare(r.influence, f.influence.op, f.influence.value)) continue
    }
    if (f.roleCount && !matchesCompare(roleCountOf(r.roleIds), f.roleCount.op, f.roleCount.value)) continue
    if (q && !(r.name.toLowerCase().includes(q) || (r.username ?? '').toLowerCase().includes(q))) continue
    out.push(r)
  }
  return out
}
