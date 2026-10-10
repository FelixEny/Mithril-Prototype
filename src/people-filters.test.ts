import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ROLE_COUNT_OPS,
  applyPeopleFilters,
  matchesRoleCount,
  roleCountOf,
  type FilterableRow,
  type RoleCountOp,
} from './people-filters.ts'

// ---------------------------------------------------------------------------
// Operator semantics (pure predicates)
// ---------------------------------------------------------------------------

test('comparison operators match their documented boundaries', () => {
  // More than 3 = 4 or more
  assert.equal(matchesRoleCount(4, 'more-than', 3), true)
  assert.equal(matchesRoleCount(5, 'more-than', 3), true)
  assert.equal(matchesRoleCount(3, 'more-than', 3), false)
  assert.equal(matchesRoleCount(0, 'more-than', 3), false)
  // Exactly 3
  assert.equal(matchesRoleCount(3, 'exactly', 3), true)
  assert.equal(matchesRoleCount(2, 'exactly', 3), false)
  assert.equal(matchesRoleCount(4, 'exactly', 3), false)
  // At least 3 = 3 or more
  assert.equal(matchesRoleCount(3, 'at-least', 3), true)
  assert.equal(matchesRoleCount(4, 'at-least', 3), true)
  assert.equal(matchesRoleCount(2, 'at-least', 3), false)
  // Fewer than 3
  assert.equal(matchesRoleCount(2, 'fewer-than', 3), true)
  assert.equal(matchesRoleCount(0, 'fewer-than', 3), true)
  assert.equal(matchesRoleCount(3, 'fewer-than', 3), false)
  // At most 3
  assert.equal(matchesRoleCount(3, 'at-most', 3), true)
  assert.equal(matchesRoleCount(2, 'at-most', 3), true)
  assert.equal(matchesRoleCount(4, 'at-most', 3), false)
})

test('operators handle zero counts correctly', () => {
  assert.equal(matchesRoleCount(0, 'exactly', 0), true)
  assert.equal(matchesRoleCount(1, 'exactly', 0), false)
  assert.equal(matchesRoleCount(0, 'more-than', 0), false)
  assert.equal(matchesRoleCount(1, 'more-than', 0), true)
  assert.equal(matchesRoleCount(0, 'at-least', 0), true)
  assert.equal(matchesRoleCount(0, 'at-most', 0), true)
  assert.equal(matchesRoleCount(1, 'at-most', 0), false)
  assert.equal(matchesRoleCount(0, 'fewer-than', 1), true)
  assert.equal(matchesRoleCount(1, 'fewer-than', 1), false)
})

test('the operator vocabulary covers exactly the five specified operators', () => {
  assert.deepEqual(
    ROLE_COUNT_OPS.map((o) => o.value),
    ['exactly', 'more-than', 'at-least', 'fewer-than', 'at-most'],
  )
  assert.deepEqual(
    ROLE_COUNT_OPS.map((o) => o.label),
    ['Exactly', 'More than', 'At least', 'Fewer than', 'At most'],
  )
})

// ---------------------------------------------------------------------------
// Counting: dedupe + @everyone exclusion
// ---------------------------------------------------------------------------

test('roleCountOf deduplicates repeated role assignments', () => {
  assert.equal(roleCountOf(undefined), 0)
  assert.equal(roleCountOf([]), 0)
  assert.equal(roleCountOf(['role_001']), 1)
  assert.equal(roleCountOf(['role_001', 'role_001']), 1)
  assert.equal(roleCountOf(['role_001', 'role_002', 'role_001', 'role_002']), 2)
  assert.equal(roleCountOf(['role_001', 'role_002', 'role_003']), 3)
})

test('the @everyone role is excluded from counts', () => {
  assert.equal(roleCountOf(['@everyone']), 0)
  assert.equal(roleCountOf(['@everyone', '@everyone']), 0)
  assert.equal(roleCountOf(['everyone']), 0)
  assert.equal(roleCountOf(['Everyone']), 0)
  assert.equal(roleCountOf(['@everyone', 'role_001', 'role_002']), 2)
  assert.equal(roleCountOf(['@everyone', '@everyone', 'role_001', 'role_001']), 1)
})

// ---------------------------------------------------------------------------
// Real corpus (src/data/members.json — actual role assignments, nothing
// fabricated; bots and members who left excluded exactly like peopleRows()
// builds the table: the roster at the data end)
// ---------------------------------------------------------------------------

interface RawMember { id: string; displayName: string; bot?: boolean; roles?: string[]; leftAt?: string | null }

const raw: RawMember[] = JSON.parse(readFileSync(new URL('./data/members.json', import.meta.url), 'utf8'))
const rows: FilterableRow[] = raw
  .filter((m) => !m.bot && !m.leftAt)
  .map((m) => ({
    id: m.id,
    name: m.displayName,
    username: null,
    tier: 'Regular' as const,
    influence: 50,
    roleIds: m.roles ?? [],
  }))

const ids = (rs: readonly FilterableRow[]) => new Set(rs.map((r) => r.id))

// Independent restatement of the operator semantics, used only to compute
// expected result sets from the corpus (guards against wiring mistakes in
// applyPeopleFilters rather than reusing matchesRoleCount to prove itself).
const expectPass = (count: number, op: RoleCountOp, value: number): boolean => {
  if (op === 'exactly') return count === value
  if (op === 'more-than') return count > value
  if (op === 'at-least') return count >= value
  if (op === 'fewer-than') return count < value
  return count <= value
}

test('More than 3 returns members with 4 or more qualifying roles', () => {
  const got = applyPeopleFilters(rows, { roleCount: { op: 'more-than', value: 3 } })
  const want = rows.filter((r) => roleCountOf(r.roleIds) >= 4)
  assert.ok(want.length > 0, 'corpus should contain members with 4+ roles')
  assert.deepEqual(ids(got), ids(want))
  for (const r of got) assert.ok(roleCountOf(r.roleIds) >= 4, `${r.name} has ${roleCountOf(r.roleIds)} roles`)
})

test('Exactly 3 returns members with exactly 3 qualifying roles', () => {
  const got = applyPeopleFilters(rows, { roleCount: { op: 'exactly', value: 3 } })
  const want = rows.filter((r) => roleCountOf(r.roleIds) === 3)
  assert.ok(want.length > 0, 'corpus should contain members with exactly 3 roles')
  assert.deepEqual(ids(got), ids(want))
  for (const r of got) assert.equal(roleCountOf(r.roleIds), 3)
})

test('At least 3 includes members with 3 or more qualifying roles', () => {
  const got = applyPeopleFilters(rows, { roleCount: { op: 'at-least', value: 3 } })
  const want = rows.filter((r) => roleCountOf(r.roleIds) >= 3)
  assert.ok(want.length > 0)
  assert.deepEqual(ids(got), ids(want))
  for (const r of got) assert.ok(roleCountOf(r.roleIds) >= 3)
})

test('members with no additional roles are counted correctly', () => {
  const exactly0 = applyPeopleFilters(rows, { roleCount: { op: 'exactly', value: 0 } })
  const fewerThan1 = applyPeopleFilters(rows, { roleCount: { op: 'fewer-than', value: 1 } })
  const atMost0 = applyPeopleFilters(rows, { roleCount: { op: 'at-most', value: 0 } })
  const want = rows.filter((r) => roleCountOf(r.roleIds) === 0)
  assert.ok(want.length > 0, 'corpus should contain members with no roles')
  assert.deepEqual(ids(exactly0), ids(want))
  assert.deepEqual(ids(fewerThan1), ids(want))
  assert.deepEqual(ids(atMost0), ids(want))
  for (const r of exactly0) assert.equal(roleCountOf(r.roleIds), 0)
})

test('the shipped corpus assigns no @everyone entries', () => {
  for (const m of raw) {
    for (const id of m.roles ?? []) {
      assert.notEqual(id.toLowerCase().replace(/^@/, ''), 'everyone', `${m.displayName} unexpectedly holds @everyone`)
    }
  }
})

test('every operator over the real corpus matches an independent computation', () => {
  const cases: [RoleCountOp, number][] = [
    ['exactly', 0], ['exactly', 3], ['exactly', 7],
    ['more-than', 0], ['more-than', 3],
    ['at-least', 0], ['at-least', 3],
    ['fewer-than', 1], ['fewer-than', 3],
    ['at-most', 0], ['at-most', 3],
  ]
  for (const [op, value] of cases) {
    const got = ids(applyPeopleFilters(rows, { roleCount: { op, value } }))
    const want = ids(rows.filter((r) => expectPass(roleCountOf(r.roleIds), op, value)))
    assert.deepEqual(got, want, `${op} ${value}`)
  }
})

test('At least 3 equals Exactly 3 plus More than 3 over the real corpus', () => {
  const atLeast = ids(applyPeopleFilters(rows, { roleCount: { op: 'at-least', value: 3 } }))
  const parts = new Set([
    ...ids(applyPeopleFilters(rows, { roleCount: { op: 'exactly', value: 3 } })),
    ...ids(applyPeopleFilters(rows, { roleCount: { op: 'more-than', value: 3 } })),
  ])
  assert.deepEqual(atLeast, parts)
})

// ---------------------------------------------------------------------------
// Combinations with the other People filters (AND semantics)
// ---------------------------------------------------------------------------

test('combines with the Roles filter as an intersection', () => {
  const roleOnly = ids(applyPeopleFilters(rows, { roleSel: ['role_009'] }))
  const countOnly = ids(applyPeopleFilters(rows, { roleCount: { op: 'more-than', value: 3 } }))
  assert.ok(roleOnly.size > 0)
  assert.ok(countOnly.size > 0)
  const both = applyPeopleFilters(rows, { roleSel: ['role_009'], roleCount: { op: 'more-than', value: 3 } })
  assert.deepEqual(ids(both), new Set([...roleOnly].filter((id) => countOnly.has(id))))
  for (const r of both) {
    assert.ok(r.roleIds.includes('role_009'))
    assert.ok(roleCountOf(r.roleIds) > 3)
  }
})

test('combines with search as an intersection', () => {
  const target = rows.find((r) => roleCountOf(r.roleIds) >= 4)
  assert.ok(target, 'corpus should contain a member with 4+ roles')
  const q = target.name.slice(0, 4).toLowerCase()
  const searchOnly = ids(applyPeopleFilters(rows, { search: q }))
  const countOnly = ids(applyPeopleFilters(rows, { roleCount: { op: 'more-than', value: 3 } }))
  assert.ok(searchOnly.size > 0)
  const both = ids(applyPeopleFilters(rows, { search: q, roleCount: { op: 'more-than', value: 3 } }))
  assert.deepEqual(both, new Set([...searchOnly].filter((id) => countOnly.has(id))))
  assert.ok(both.has(target.id))
})

test('combines with activity tier and influence filters', () => {
  const rc = { op: 'at-least', value: 3 } as const
  const baseline = ids(applyPeopleFilters(rows, { roleCount: rc }))
  assert.ok(baseline.size > 0)
  // Every fixture row is a Regular with influence 50, so these columns are
  // neutral: the role count result must pass through unchanged...
  assert.deepEqual(ids(applyPeopleFilters(rows, { tiers: ['Regular'], roleCount: rc })), baseline)
  assert.deepEqual(ids(applyPeopleFilters(rows, { minInf: 40, roleCount: rc })), baseline)
  // ...and excluded values must empty the result.
  assert.equal(applyPeopleFilters(rows, { tiers: ['Superuser'], roleCount: rc }).length, 0)
  assert.equal(applyPeopleFilters(rows, { minInf: 60, roleCount: rc }).length, 0)
})

test('combines with a segment id set as an intersection', () => {
  const segIds = new Set(rows.slice(0, 10).map((r) => r.id))
  const countOnly = ids(applyPeopleFilters(rows, { roleCount: { op: 'at-least', value: 3 } }))
  const both = ids(applyPeopleFilters(rows, { segIds, roleCount: { op: 'at-least', value: 3 } }))
  assert.deepEqual(both, new Set([...countOnly].filter((id) => segIds.has(id))))
})

test('no active filters returns every row, and Role Count off changes nothing', () => {
  assert.equal(applyPeopleFilters(rows, {}).length, rows.length)
  assert.equal(applyPeopleFilters(rows, { roleCount: null }).length, rows.length)
  assert.equal(applyPeopleFilters(rows, { roleCount: undefined, search: '' }).length, rows.length)
})
