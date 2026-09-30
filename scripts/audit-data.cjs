// Coherence audit for the generated corpus. Validates the invariants the app and
// the Overview depend on, in BOTH timestamp readings: raw JSON (Date.parse) and
// the shift-corrected view the app uses (src/data/index.ts re-adds 1h for Lagos
// wall-clock). Run after scripts/generate-data.mjs:
//
//   node scripts/audit-data.cjs
const { readFileSync } = require('node:fs')
const { join, dirname } = require('node:path')

const dataDir = join(__dirname, '..', 'src', 'data')
const R = (n) => JSON.parse(readFileSync(join(dataDir, `${n}.json`), 'utf8'))

const SHIFT = 3600000 // the app's Lagos offset, see src/data/index.ts
const members = R('members')
const messages = R('messages')
const replies = R('replies')
const reactions = R('reactions')
const voice = R('voice-sessions')
const community = R('community')
const schema = R('schema')
const threads = R('threads')
const channels = R('channels')

const byId = new Map(members.map((m) => [m.id, m]))
const msgById = new Map(messages.map((m) => [m.id, m]))
const T = (s) => Date.parse(s)
const corpusEnd = T(schema.dateRange.end)
const corpusStart = T(schema.dateRange.start)

let failures = 0
const chk = (ok, label, detail) => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` -- ${detail}` : ''}`)
}

// ---------------------------------------------------------------- membership
{
  const n = members.filter((m) => m.leftAt).length
  const bad = members.filter((m) => m.leftAt && (T(m.leftAt) < T(m.joinedAt) || T(m.leftAt) > corpusEnd))
  chk(bad.length === 0, 'leave falls inside [joinedAt, corpusEnd]', `${n} leavers${bad.length ? `, ${bad.length} out of range` : ''}`)
}
chk(members.every((m) => 'leftAt' in m), 'leftAt present on every member record')
chk(members.every((m) => !m.bot || !m.leftAt), 'bots never leave')
{
  const ids = members.map((m) => m.id)
  chk(ids.length === new Set(ids).size, 'member ids unique', `${ids.length} members`)
}
chk(
  new Set(members.map((m) => m.displayName.toLowerCase())).size === members.length,
  'display names unique',
)
chk(new Set(members.map((m) => m.username.toLowerCase())).size === members.length, 'usernames unique')

// ------------------------------------------------------- joinedAt <= activity
// Checked on both readings; see JOIN_SHIFT in generate-data.mjs.
{
  const firstRaw = new Map()
  const track = (id, iso) => {
    const t = T(iso)
    const p = firstRaw.get(id)
    if (p === undefined || t < p) firstRaw.set(id, t)
  }
  for (const m of messages) track(m.authorId, m.timestamp)
  for (const r of replies) track(r.authorId, r.timestamp)
  for (const v of voice) track(v.memberId, v.startedAt)
  for (const r of reactions) track(r.memberId, r.timestamp)
  let raw = 0
  let shifted = 0
  let unknown = 0
  for (const [id, t] of firstRaw) {
    const m = byId.get(id)
    if (!m) { unknown++; continue }
    if (t < T(m.joinedAt)) raw++
    if (t + SHIFT < T(m.joinedAt) + SHIFT) shifted++
  }
  chk(unknown === 0, 'every activity author resolves to a member', unknown ? `${unknown} unknown` : '')
  chk(raw === 0, 'no member is active before joining (raw ISO)', raw ? `${raw} violations` : '')
  chk(shifted === 0, 'no member is active before joining (app-shifted)', shifted ? `${shifted} violations` : '')
}

// ------------------------------------------------------ activity within window
{
  let early = 0
  let late = 0
  const test = (iso) => {
    const t = T(iso)
    if (t < corpusStart) early++
    if (t > corpusEnd) late++
  }
  for (const m of messages) test(m.timestamp)
  for (const r of replies) test(r.timestamp)
  for (const r of reactions) test(r.timestamp)
  for (const v of voice) test(v.startedAt)
  chk(early === 0 && late === 0, 'all activity inside the schema date range', `${early} early, ${late} late`)
}

// ----------------------------------------------- no activity after a departure
{
  const lastRaw = new Map()
  const track = (id, iso) => {
    const t = T(iso)
    const p = lastRaw.get(id)
    if (p === undefined || t > p) lastRaw.set(id, t)
  }
  for (const m of messages) track(m.authorId, m.timestamp)
  for (const r of replies) track(r.authorId, r.timestamp)
  for (const v of voice) track(v.memberId, v.startedAt)
  let bad = 0
  for (const [id, t] of lastRaw) {
    const m = byId.get(id)
    if (m?.leftAt && t > T(m.leftAt)) bad++
  }
  chk(bad === 0, 'no message/reply/voice after a member left', bad ? `${bad} violations` : '')
}
{
  let bad = 0
  for (const r of reactions) {
    const m = byId.get(r.memberId)
    if (m?.leftAt && T(r.timestamp) > T(m.leftAt)) bad++
  }
  chk(bad === 0, 'no reaction after a member left', bad ? `${bad} violations` : '')
}
{
  // A reply/reaction also cannot predate its parent message.
  let bad = 0
  for (const r of replies) {
    const p = msgById.get(r.messageId)
    if (p && T(r.timestamp) < T(p.timestamp)) bad++
  }
  for (const r of reactions) {
    const p = msgById.get(r.messageId)
    if (p && T(r.timestamp) < T(p.timestamp)) bad++
  }
  chk(bad === 0, 'replies and reactions never predate their message', bad ? `${bad} violations` : '')
}

// ------------------------------------------------------------- referential
{
  const missingReply = replies.filter((r) => !msgById.has(r.messageId)).length
  const missingRx = reactions.filter((r) => !msgById.has(r.messageId)).length
  chk(missingReply === 0, 'replies reference a real message', missingRx ? '' : '')
  chk(missingRx === 0, 'reactions reference a real message', missingRx ? `${missingRx} orphaned` : '')
}
{
  const channelIds = new Set(channels.map((c) => c.id))
  const voiceIds = new Set(R('voice-channels').map((c) => c.id))
  const threadIds = new Set(threads.map((t) => t.id))
  const badCh = messages.filter((m) => !channelIds.has(m.channelId)).length
  const badTh = messages.filter((m) => m.threadId && !threadIds.has(m.threadId)).length
  const badVc = voice.filter((v) => !voiceIds.has(v.channelId)).length
  chk(badCh === 0, 'messages reference a real channel', badCh ? `${badCh} orphaned` : '')
  chk(badTh === 0, 'messages reference a real thread', badTh ? `${badTh} orphaned` : '')
  chk(badVc === 0, 'voice sessions reference a real voice channel', badVc ? `${badVc} orphaned` : '')
}

// ------------------------------------------------------------- headline counts
{
  const present = members.filter((m) => !m.bot && !m.leftAt).length
  chk(community.memberCount === present, 'community.memberCount equals present non-bot roster', `${community.memberCount} vs ${present}`)
}
{
  // New-members headline must actually react to the date range: it was flat at 70
  // across 30/60/90 days before the mid-year cohort was added.
  const win = (d) => members.filter((m) => !m.bot && T(m.joinedAt) >= corpusEnd - d * 86400000).length
  const d30 = win(30)
  const d60 = win(60)
  const d90 = win(90)
  chk(d30 < d60 && d60 < d90, 'new-member count grows with the date range', `30d=${d30} 60d=${d60} 90d=${d90}`)
}
{
  // Net movement should not read as a server in freefall.
  const left = members.filter((m) => m.leftAt && T(m.leftAt) >= corpusEnd - 30 * 86400000).length
  const joined = members.filter((m) => !m.bot && T(m.joinedAt) >= corpusEnd - 30 * 86400000).length
  chk(left <= joined, '30-day leavers do not exceed 30-day joiners', `joined=${joined} left=${left} net=${joined - left}`)
}

console.log('')
console.log(`corpus: ${messages.length} messages, ${replies.length} replies, ${reactions.length} reactions, ${voice.length} voice sessions`)
console.log(`roster: ${members.filter((m) => !m.bot).length} humans (${members.filter((m) => !m.bot && m.leftAt).length} left), ${members.filter((m) => m.bot).length} bots`)
console.log('')
console.log(failures ? `${failures} AUDIT FAILURE(S)` : 'ALL COHERENCE RULES PASS')
process.exit(failures ? 1 : 0)