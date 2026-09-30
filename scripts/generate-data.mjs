import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CULTURES } from './name-data.mjs'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const dataDir = join(root, 'src', 'data')
const read = (name) => JSON.parse(readFileSync(join(dataDir, `${name}.json`), 'utf8'))
const write = (name, value) => writeFileSync(join(dataDir, `${name}.json`), JSON.stringify(value, null, 2))

// ---------------------------------------------------------------------------
// Deterministic helpers
// ---------------------------------------------------------------------------
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const pick = (items, seed) => items[hash(seed) % items.length]
const pickN = (items, n, seed) => { const out = []; const copy = [...items]; for (let k = 0; k < n && copy.length; k++) { const i = hash(seed + ':' + k) % copy.length; out.push(copy.splice(i, 1)[0]) } return out }
const rint = (seed, lo, hi) => lo + (hash(seed) % (hi - lo + 1))
const rfract = (plantIndex, lo, hi) => {
  const t = ((plantIndex * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  return lo + t * (hi - lo)
}

// ---------------------------------------------------------------------------
// Load sources
// ---------------------------------------------------------------------------
const members = read('members')
const channels = read('channels')
const voiceChannels = read('voice-channels')
const roles = read('roles')
const community = read('community')
const schema = read('schema')
const existingMessages = read('messages')
const existingReplies = read('replies')
const existingReactions = read('reactions')
const existingVoice = read('voice-sessions')
const existingThreads = (() => { try { return read('threads') } catch { return [] } })()

// Full rebuilds must not see stale persisted corpora. Normal runs intentionally
// reuse history and only append the newest period, but MC_REBUILD=1 regenerates
// everything from scratch: if the old messages stayed visible, the recent-window
// shaping pass would calibrate new output against the discarded corpus and the
// rebuild would inherit its volume instead of regenerating it.
const REBUILD = process.env.MC_REBUILD === '1'
if (REBUILD) {
  existingMessages.length = 0
  existingReplies.length = 0
  existingReactions.length = 0
  existingVoice.length = 0
  existingThreads.length = 0
}

// ---------------------------------------------------------------------------
// Mid-year cohort
// ---------------------------------------------------------------------------
// The seeded roster joins almost entirely in Dec 2023 - Apr 2024 and then nothing
// until Aug, so May, June and July have zero joins. That is why "New Members"
// reads 70 for a 30-, 60- and 90-day window alike -- the date range does nothing
// to the Overview headline. It cannot be fixed by redistribution: only 106 of
// 2400 members have any activity on or after 1 Jun, and joinedAt <= firstMessage
// blocks moving the rest, so the gap needs real records.
//
// This block strips any previously written cohort on load, before role and name
// assignment. Those blocks are sized on members.length and consume CULTURES in
// order, so a persisted cohort would shift every slot and reshuffle all 2400
// existing names. Stripping here and re-deriving below keeps the run idempotent.
const COHORT_PER_MONTH = 80
const COHORT_MONTHS = ['2024-05', '2024-06', '2024-07']
const COHORT_FIRST = 2401
const COHORT_TOTAL = COHORT_PER_MONTH * COHORT_MONTHS.length
const cohortId = (n) => `m_${String(n).padStart(4, '0')}`
{
  let stripped = 0
  for (let i = members.length - 1; i >= 0; i--) {
    const id = members[i].id
    if (!id.startsWith('m_')) continue
    const n = Number(id.slice(2))
    if (n >= COHORT_FIRST && n < COHORT_FIRST + COHORT_TOTAL) { members.splice(i, 1); stripped++ }
  }
  if (stripped) console.log(`cohort: stripped ${stripped} previously written records`)
}

// ---------------------------------------------------------------------------
// Backdate migration: shift persisted calendar dates from the 2026 launcher
// era back to 2024 so the whole corpus reads as "the first six months of 2024".
// Only the leading year token of each ISO string changes â€” wall clock,
// month/day and hour are preserved, so windows, weekday curves and hour
// distributions stay shaped the same. Idempotent: once dates carry 2024 (or
// 2023) years the pass no-ops, so re-runs reproduce the same corpus instead of
// shifting again.
// ---------------------------------------------------------------------------
const backdateIso = (iso) => (typeof iso === 'string' && parseInt(iso.slice(0, 4), 10) >= 2025
  ? iso.replace(/^\d{4}-/, parseInt(iso.slice(0, 4), 10) - 2 + '-')
  : iso)
for (const m of existingMessages) m.timestamp = backdateIso(m.timestamp)
for (const v of existingVoice) { v.startedAt = backdateIso(v.startedAt); v.endedAt = backdateIso(v.endedAt) }
for (const m of members) m.joinedAt = backdateIso(m.joinedAt)
community.createdAt = backdateIso(community.createdAt)

// Member roles: deterministic assignment against the roles.json roster
// (Core-Team role_001, Moderator role_002, Admin role_003, Cohort-Mentor
// role_004, Bounty-Hunter role_005, Contributor role_006, Ambassador role_007,
// Degen role_008, Member role_009, Design role_010). Seed roles are discarded —
// every run rebuilds from fixed tags, so re-runs are byte-identical. Staff
// (Admin, Moderator, Core-Team) are tiny fixed-size cohorts; specialty roles
// stack on Member Discord-style; ~10% of humans (weighted toward low-activity
// authors by existing message+reply counts) carry no roles at all. Bots keep [].
{
  const humans = members.filter((m) => !m.bot).sort((a, b) => a.id.localeCompare(b.id))
  const activity = new Map()
  for (const m of existingMessages) activity.set(m.authorId, (activity.get(m.authorId) || 0) + 1)
  for (const r of existingReplies) activity.set(r.authorId, (activity.get(r.authorId) || 0) + 1)
  const assigned = new Map(humans.map((m) => [m.id, []]))
  let remaining = humans.map((m) => m.id)
  const claim = (n, tag, role) => {
    const ids = pickN(remaining, n, tag)
    const set = new Set(ids)
    for (const id of ids) assigned.get(id).push(role)
    remaining = remaining.filter((id) => !set.has(id))
  }
  claim(6, 'member-role:admin', 'role_003')
  claim(9, 'member-role:moderator', 'role_002')
  claim(25, 'member-role:coreteam', 'role_001')
  claim(40, 'member-role:mentor', 'role_004')
  claim(80, 'member-role:bounty', 'role_005')
  claim(150, 'member-role:contributor', 'role_006')
  claim(120, 'member-role:ambassador', 'role_007')
  claim(200, 'member-role:degen', 'role_008')
  claim(80, 'member-role:design', 'role_010')
  // ~10% role-less, weighted toward low activity: uniform pick from the
  // quieter half of the remaining pool.
  const quiet = [...remaining].sort((a, b) => (activity.get(a) || 0) - (activity.get(b) || 0) || (a < b ? -1 : 1))
  const roleless = new Set(pickN(quiet.slice(0, Math.ceil(quiet.length / 2)), 240, 'member-role:none'))
  remaining = remaining.filter((id) => !roleless.has(id))
  for (const m of humans) {
    const roles = assigned.get(m.id)
    if (!roleless.has(m.id)) roles.push('role_009')
    m.roles = roles
  }
  for (const m of members) if (m.bot) m.roles = []
}

// Member display names: culture-scoped assignment. Each member is allocated to
// a culture (largest-remainder from CULTURES weights), then a given + surname
// pair is drawn from THAT culture's given/surname pools only, preserving
// culturally coherent full names ("Adaeze Obi", never "Adaeze Wood") with
// "Given Surname" ordering everywhere. Allocation and pools are sampled with
// pickN/pick seeded on fixed tags â†’ deterministic, idempotent, and independent
// of the corpus messages (which reference members by id, not name).
const cultureTotal = CULTURES.reduce((s, c) => s + c.weight, 0)
const cultureSlots = [] // ordered culture ids, one per member
{
  const exactCounts = CULTURES.map((c) => (c.weight / cultureTotal) * members.length)
  const floors = exactCounts.map(Math.floor)
  let remaining = members.length - floors.reduce((s, n) => s + n, 0)
  // Largest-remainder: hand out the leftover seats to the cultures with the
  // biggest remainders, ties broken by culture id for determinism.
  const order = [...CULTURES.keys()].sort((a, b) => (exactCounts[b] % 1) - (exactCounts[a] % 1) || (CULTURES[a].id < CULTURES[b].id ? -1 : 1))
  for (const i of order) {
    if (remaining <= 0) break
    floors[i] += 1
    remaining -= 1
  }
  for (let i = 0; i < CULTURES.length; i++) for (let k = 0; k < floors[i]; k++) cultureSlots.push(CULTURES[i].id)
}
const cultureAssign = pickN(cultureSlots, members.length, 'member-culture')
const cultureById = new Map([...members].sort((a, b) => (a.id < b.id ? -1 : 1)).map((m, i) => [m.id, CULTURES.find((c) => c.id === cultureAssign[i])]))

// Per-culture given Ã— surname combos (skipping identical given/surname tokens),
// sampled without replacement within each culture, assigned by sorted member id.
const uniqueNames = []
const usedFullNames = new Set()
const sortedMembers = [...members].sort((a, b) => (a.id < b.id ? -1 : 1))
const byCulture = new Map()
for (const m of sortedMembers) {
  const cid = cultureById.get(m.id).id
  if (!byCulture.has(cid)) byCulture.set(cid, [])
  byCulture.get(cid).push(m.id)
}
for (const culture of CULTURES) {
  const ids = byCulture.get(culture.id)
  if (!ids) continue
  const combos = culture.given.flatMap((g) =>
    culture.surnames.filter((s) => s.toLowerCase() !== g.toLowerCase()).map((s) => `${g} ${s}`))
  const pool = [...new Set(combos)]
  if (pool.length < ids.length) throw new Error(`Name pool too small for ${culture.id}: ${pool.length} combos < ${ids.length}`)
  const picks = pickN(pool, ids.length, `member-names:${culture.id}`)
  for (let i = 0; i < ids.length; i++) {
    const full = `${picks[i]}`
    if (usedFullNames.has(full.toLowerCase())) throw new Error(`Duplicate full name across cultures: ${full}`)
    usedFullNames.add(full.toLowerCase())
    uniqueNames.push(full)
  }
}
const namesById = new Map()
{
  let idx = 0
  for (const culture of CULTURES) {
    const ids = byCulture.get(culture.id)
    if (!ids) continue
    for (const id of ids) namesById.set(id, uniqueNames[idx++])
  }
}
for (const m of members) m.displayName = namesById.get(m.id)
if (new Set(members.map((m) => m.displayName.toLowerCase())).size !== members.length) throw new Error('Name assignment produced duplicates')

// Member usernames: derived from the culture-scoped display name. Each member's
// handle is generated from their OWN given + surname tokens (so the @-handle
// always traces to the visible name: "Adaeze Obi" -> @adaeze.obi, never a
// leftover seed handle like @ivyallen1). Handles read as realistic Discord /
// community handles: a mix of clean "given.surname", numbered "given.surname27",
// underscore "given_surname", initial "a.obi", and goofier handles that still
// keep the given token visible ("xxadaeze", "therealadaeze", "adaeze_lol",
// "adaeze.szn"). Style + any digits are sampled deterministically via seeded
// picks on fixed tags, so re-runs are byte-identical. House-rule: staff /
// admins keep clean "given.surname" handles (easier to recognize in
// @-mentions); everyone else gets the varied flavor mix. Global dedupe: on slug
// collision (accent-stripped names can collide across cultures, e.g. Mexico's
// "Jose Garcia" vs "Jose Garcia") a deterministic numeric suffix from a seeded
// retry counter is appended; final uniqueness is asserted the same way names are.
const slugify = (s) => s
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
const handleFlavors = [
  'xx', 'thereal', '_lol', '.szn', '.vibes', 'sucha', 'notyour', '_gamer',
  'thegoat', '_zzz', '.gg', '.boi', '.szn', '_w',
]
const usedHandles = new Set()
{
  const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id))
  for (const m of sorted) {
    const tokens = m.displayName.split(' ').filter(Boolean)
    const given = slugify(tokens[0])
    const surname = slugify(tokens.slice(1).join(' ') || tokens[0])
    const roles = Array.isArray(m.roles) ? m.roles : []
    const isStaff = roles.includes('role_001') || roles.includes('role_003')
    // House-rule: staff / admins keep clean "given.surname" handles.
    let base
    if (isStaff) {
      base = `${given}.${surname}`
    } else {
      // Weighted flavor mix; 3/9 ~ 33% land goofy (keeps given visible).
      const style = pick(['clean', 'clean', 'numbered', 'numbered', 'underscore', 'initial', 'goofy', 'goofy', 'goofy'], 'handle-style:' + m.id)
      if (style === 'numbered') {
        base = `${given}.${surname}${hash('handle-num:' + m.id) % 90 + 10}`
      } else if (style === 'underscore') {
        base = `${given}_${surname}`
      } else if (style === 'initial') {
        base = `${(given[0] || 'x')}.${surname}`
      } else if (style === 'goofy') {
        const flavor = pick(handleFlavors, 'handle-flavor:' + m.id)
        base = `${given}${flavor}`
      } else {
        base = `${given}.${surname}`
      }
    }
    let handle = base
    let k = 0
    while (usedHandles.has(handle.toLowerCase())) {
      handle = `${base}${hash('handle-retry:' + m.id + ':' + k++) % 999 + 101}`
    }
    usedHandles.add(handle.toLowerCase())
    m.username = handle
  }
}
if (new Set(members.map((m) => m.username.toLowerCase())).size !== members.length) throw new Error('Username assignment produced duplicates')

const cohortStart = members.length
// ---------------------------------------------------------------------------
// Mid-year cohort (injection)
// ---------------------------------------------------------------------------
// Re-injected here, after roles and names are assigned, so the 2400 seeded
// members keep their identities: the assignment blocks above are sized on
// members.length and consume the culture/name/handle pools in order, so any
// cohort present during them would shift every slot and reshuffle the whole
// roster. Appending afterwards keeps names stable and still gives the cohort
// the same culturally-scoped naming, role and handle treatment as everyone else.
//
// Archetype mix mirrors how mid-year joiners actually behave on a server this
// size: mostly inactive (joined, never posted, drifted off -- exactly the
// people who leave again within weeks), with a smaller lurker/new tail. The
// leave pass below will draw their departures from their own tenure window.
// A couple of them land voice-only sessions, which is realistic for people who
// join for one call and never post.
{
  const existingNames = new Set(members.map((m) => m.displayName.toLowerCase()))
  const existingHandles = new Set(members.map((m) => m.username.toLowerCase()))
  const existing = new Set(members.map((m) => m.id))
  // Largest-remainder allocation over the same CULTURES weights, seeded
  // separately from the roster's allocation so the two never interleave slots.
  const exact = CULTURES.map((c) => (c.weight / cultureTotal) * COHORT_TOTAL)
  const counts = exact.map(Math.floor)
  let leftover = COHORT_TOTAL - counts.reduce((s, n) => s + n, 0)
  const remainderOrder = [...CULTURES.keys()].sort((a, b) => (exact[b] % 1) - (exact[a] % 1) || (CULTURES[a].id < CULTURES[b].id ? -1 : 1))
  for (let k = 0; leftover > 0; k++, leftover--) counts[remainderOrder[k % remainderOrder.length]]++
  const archetypeMix = ['inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'inactive', 'lurker', 'lurker', 'new']
  let n = 0
  for (let ci = 0; ci < CULTURES.length; ci++) {
    const culture = CULTURES[ci]
    const want = counts[ci]
    if (!want) continue
    const combos = [...new Set(culture.given.flatMap((g) =>
      culture.surnames.filter((s) => s.toLowerCase() !== g.toLowerCase()).map((s) => `${g} ${s}`)))]
      .filter((c) => !existingNames.has(c.toLowerCase()))
    if (combos.length < want) throw new Error(`Cohort name pool too small for ${culture.id}: ${combos.length} < ${want}`)
    const names = pickN(combos, want, `cohort-names:${culture.id}`)
    for (let i = 0; i < want; i++) {
      const id = cohortId(COHORT_FIRST + n)
      n++
      if (existing.has(id)) throw new Error(`Cohort id collision: ${id}`)
      const full = names[i]
      existingNames.add(full.toLowerCase())
      const tokens = full.split(' ').filter(Boolean)
      const given = slugify(tokens[0])
      const surname = slugify(tokens.slice(1).join(' ') || tokens[0])
      const style = pick(['clean', 'clean', 'clean', 'numbered', 'underscore', 'goofy', 'goofy'], 'cohort-handle-style:' + id)
      let base = style === 'numbered' ? `${given}.${surname}${hash('cohort-handle-num:' + id) % 90 + 10}`
        : style === 'underscore' ? `${given}_${surname}`
          : style === 'goofy' ? `${given}${pick(handleFlavors, 'cohort-handle-flavor:' + id)}`
            : `${given}.${surname}`
      let handle = base
      let k = 0
      while (existingHandles.has(handle.toLowerCase())) handle = `${base}${hash('cohort-handle-retry:' + id + ':' + k++) % 999 + 101}`
      existingHandles.add(handle.toLowerCase())
      // Joined on a day inside their cohort month, so the Overview's period-scoped
      // New Members count reads ~80/month across May-Jul instead of 0.
      const month = COHORT_MONTHS[Math.floor((n - 1) / COHORT_PER_MONTH)]
      const day = 1 + (hash('cohort-join-day:' + id) % 27)
      members.push({
        id,
        username: handle,
        displayName: full,
        joinedAt: `${month}-${String(day).padStart(2, '0')}T${String(hash('cohort-join-hour:' + id) % 12 + 8).padStart(2, '0')}:${String(hash('cohort-join-min:' + id) % 60).padStart(2, '0')}:00+01:00`,
        roles: hash('cohort-specialty:' + id) % 10 === 0 ? ['role_007', 'role_009'] : ['role_009'],
        bot: false,
        archetype: archetypeMix[(n - 1) % archetypeMix.length],
        leftAt: null,
      })
    }
  }
  if (n !== COHORT_TOTAL) throw new Error(`Cohort size mismatch: ${n} != ${COHORT_TOTAL}`)
  console.log(`cohort: injected ${n} members across ${COHORT_MONTHS.join(', ')}`)
}

const END_ISO = '2024-09-07T23:59:00+01:00'
const END = new Date(END_ISO).getTime()
const DAY = 86400000
const pad = (n, w = 2) => String(n).padStart(w, '0')
const toIso = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+01:00`
}
const lOn = (t) => new Date(t).getTime()

// ---------------------------------------------------------------------------
// Content pools
// ---------------------------------------------------------------------------
const TOPICS = {
  technical: ['event-driven architecture', 'the new SDK release', 'state management patterns', 'container deploys', 'type-safety', 'the GraphQL migration', 'CI pipeline caching', 'database sharding', 'serverless cold starts', 'the realtime websocket layer', 'observability dashboards', 'the package version bump', 'RBAC permissions', 'WebGPU support', 'caching strategies', 'the migration script'],
  product: ['the upcoming roadmap', 'activation metrics', 'the onboarding funnel', 'retention cohorts', 'the new dashboard', 'feature flags', 'pricing tiers', 'the admin experience', 'our 2024 goals', 'the community program', 'feedback loops', 'the growth experiments', 'release cadence', 'the API surface', 'onboarding emails'],
  design: ['the new design system', 'typography scale', 'color tokens', 'the empty states', 'motion principles', 'the component library', 'dark mode support', 'illustration style', 'the icon set', 'spacing rules', 'the prototype', 'accessibility contrast', 'the onboarding flow', 'micro-interactions', 'the new marketing site'],
  community: ['the community guidelines', 'the welcome flow', 'office hours', 'the events calendar', 'mentorship program', 'the spotlight channel', 'community badges', 'the monthly recap', 'town halls', 'the contributor program', 'guild channels', 'the ambassador program', 'moderation practices', 'the feedback survey', 'new member intros'],
  support: ['the setup guide', 'the troubleshooting doc', 'the import tool', 'connection issues', 'the billing portal', 'the migration wizard', 'the status page', 'the config file', 'the mobile app', 'two-factor auth', 'the rate limit', 'the webhook setup', 'the CLI install', 'permission errors', 'the export feature'],
  social: ['the weekend plans', 'that new release', 'the movie everyone watched', 'the latest update', 'the tournament', 'the shared playlist', 'the cooking experiment', 'the pet photos', 'the hiking trail', 'the book we are reading', 'the game night', 'the hackathon idea', 'the silly glitch', 'the retro vibes'],
}
const BRANDS = { technical: 'the dev tool', product: 'the platform', design: 'the design', community: 'the server', support: 'the product', social: 'this thing' }

const FRAMES = [
  'Has anyone looked into {topic} yet?',
  'Real talk: {topic} is a bigger deal than people think.',
  'Just spent the morning on {topic}. Worth it?',
  'Can we get more eyes on {topic}?',
  'I keep coming back to {topic}.',
  'Quick question about {topic}.',
  '{topic} â€” anyone else seeing this too?',
  'We finally shipped the fix for {topic}.',
  'Trying to wrap my head around {topic}.',
  'Would love a write-up on {topic}.',
  'Honestly {topic} changed how I work.',
  'Reminder: {topic} discussion is still open.',
  'I found a neat trick for {topic}.',
  '{topic} keeps buzzing in my DMs.',
  'What does everyone think about {topic}?',
  'Small win today: cracked {topic}.',
  'I had doubts about {topic}, but it works.',
  '{topic} is my favorite rabbit hole this week.',
  'Opinions on {topic}? Be honest.',
  'Shoutout to whoever documented {topic}.',
  'Hitting an edge case with {topic}.',
  'We should schedule office hours about {topic}.',
  'Bumping the thread on {topic}.',
  'Anyone free to pair on {topic}?',
]
const MENTION_FRAMES = [
  'Hey @{user}, any thoughts on {topic}?',
  'Tagging @{user} â€” this is right up your alley: {topic}.',
  '@{user} and I were debating {topic}.',
  'I told @{user} about {topic}.',
  'Pinging @{user} for {topic}.',
]
const REACTION_LINES = [
  'This. Exactly this.',
  'Second the motion.',
  'Came here to say this.',
  'Big +1 from me.',
  'That made my day.',
  'Okay, that is actually clever.',
  'Love the direction.',
  'Bookmarking this.',
  'Totally agree.',
  'Needed to hear this today.',
  'Same energy over here.',
  'Too real ðŸ˜…',
]
const QUESTION_LINES = [
  'Can someone help me understand this?',
  'What am I missing here?',
  'Does anyone have a workaround?',
  'Is this a known issue or just me?',
  'Where should this live in the docs?',
  'How are you all handling this?',
  'Should we do this now or after launch?',
  'Any examples of this in the wild?',
  'Which tool is best for this?',
  'Would you call this a bug or intended?',
  'What does the roadmap say about this?',
  'Has the team shared anything about this?',
]
const SUPPORT_LINES = [
  'Check the troubleshooting doc, first step covers this.',
  'Sounds like the cache â€” try clearing it.',
  'That error is usually the API key format.',
  'You are likely rate limited; wait a minute and retry.',
  'Can you paste the full stack trace?',
  'Try a clean install and see if it persists.',
  'That looks like a permissions issue.',
  'This is fixed in the latest build.',
  'Our status page shows an ongoing incident.',
  'DM me your config and I will take a look.',
  'The import tool has a known issue with that format.',
  'Update the CLI first, then retry.',
]
const INTRO_LINES = [
  'Hey everyone! Just joined â€” nice to meet you all.',
  'Happy to be here! I build {topic}.',
  'New here, looking forward to learning from the community.',
  'Hi there! Been lurking for a while, finally saying hi.',
  'Joined the community â€” tell me where to start?',
  "Hello! I'm a longtime {topic} enthusiast.",
  'Waving from across the world ðŸ‘‹',
  'Got pointed here by a friend. Great vibes already.',
]
const WELCOME_LINES = [
  'Welcome! Check the pins in #announcements.',
  'Glad you are here! Tell us a bit about yourself.',
  'Welcome aboard ðŸŽ‰',
  'Make sure to read the community guidelines when you can.',
  'Welcome! Grab a role from the list below.',
  'Hey, welcome! Great community spirit in here.',
  'Welcome ðŸŽ‰ Feel free to ask anything.',
  'Welcome! The #introductions thread is a great start.',
]
const ANNOUNCE_LINES = [
  'Reminder: office hours are tomorrow at 18:00.',
  'We shipped a big update â€” check the changelog.',
  'Call for contributors for the community program.',
  'Voting for this month\u2019s featured project opens Friday.',
  'Maintenance window scheduled for Sunday 02:00.',
  'New cohort for the mentorship program is open.',
  'Version 2.4 lands this week with a major rework.',
  'Town hall recap is posted in the forum.',
  'Survey closes Friday â€” 5 minutes to shape the roadmap.',
  'Next community call is Wednesday; bring your questions.',
  'We are hiring! Two roles just opened up.',
  'Event this weekend: builders showcase. Sign up below.',
]
const MEME_LINES = [
  'Accurate ðŸ˜‚',
  'This is the content I signed up for.',
  'Sending this to the whole team.',
  'The accuracy of this post is unreal.',
  'I have seen this exact situation play out.',
  'Certified classic.',
  'This could be a leak from our standup.',
  'Laughing loudly at this one.',
  'Whoever made this deserves a raise.',
  'This hurts because it is true.',
  'Immediately sharing this.',
  'The reply options on this are wild.',
]
const JOB_LINES = [
  'We are hiring a senior engineer â€” remote first.',
  'Two openings: design and devrel.',
  'Internship program open for applications.',
  'Freelance gig: help with a weekend migration.',
  'Company is growing, adding a PM role.',
  'Looking for a part-time community manager.',
  'Our team needs a data analyst.',
  'Hiring a web3 marketer with Discord experience.',
  'Opening for a security reviewer.',
  'We need a docs writer, contract role.',
]
const EVENT_LINES = [
  'Event recap: huge turnout, thanks everyone!',
  'Reminder to RSVP for the builders showcase.',
  'Voting on the next workshop topic is live.',
  'Doors open at 17:00 â€” see you there.',
  'Stream link will be pinned before the call.',
  'Workshop this weekend: intro to automations.',
  'Town hall moved to Thursday due to schedule conflicts.',
  'Venue change for the meetup â€” check the event post.',
  'Save the date: annual community summit.',
  'Recap thread is up with the recording links.',
]

const REPLY_LINES = [
  'I ran into the same thing.',
  'Good point.',
  'That makes sense.',
  'I would approach it differently.',
  'Could you share more detail?',
  'This worked for me yesterday.',
  'Agreed, this deserves more attention.',
  'Happening here too.',
  'We fixed that with a different config.',
  'Let me dig into this and follow up.',
  'That aligns with what I have seen.',
  'I was just about to mention this.',
  'Thanks for sharing, this is useful.',
  'Mind sharing the repro steps?',
  'We had the same bug last quarter.',
  'Adding this to our backlog.',
  'I am not so sure â€” worth stress testing.',
  'Do you have logs for that window?',
  'In my experience the fix holds.',
  'This is exactly the kind of thread we need more of.',
  'Correct me if I am wrong, but...',
  'Reading the docs, this is expected behavior.',
]

const CHANNELS = [...channels]

// channel -> category mapping (based on channels.json `category` field)
const CATEGORY = Object.fromEntries(channels.map((c) => [c.id, c.category || 'broad']))

// ---------------------------------------------------------------------------
// Threads (conversations) â€” fill the trending-conversations gap
// ---------------------------------------------------------------------------
const THREADS = [
  { id: 'thread_roadmap_4', channelId: 'ch_product', name: 'Q3 roadmap priorities', text: 'Which roadmap item should the community bet on first for Q3? Activation is flat, the backlog is overflowing, and leadership wants one big swing. Make your case below and bring numbers if you have them.' },
  { id: 'thread_feedback_9', channelId: 'ch_feedback', name: 'Onboarding friction review', text: 'Where do new members hit the most friction in the onboarding flow? We have watched a dozen first sessions this month and the same two screens keep tripping people up. Drop timestamps or screenshots so we can fix the worst of it first.' },
  { id: 'thread_launch_15', channelId: 'ch_builders', name: 'Launch-week hotfixes', text: 'Tracking the hotfixes coming out of launch week — help us prioritize. The payment webhook retry bug is confirmed and the mobile offline queue is flaky on older devices. React with what is biting you and we will sequence the patches accordingly.' },
  { id: 'thread_event_21', channelId: 'ch_general', name: 'Community call topics', text: 'What should we cover on the upcoming community call? Last time the live debugging segment ran long, so this month we are timeboxing demos to five minutes each. Nominate your topic and vote on the ones you want explained.' },
  { id: 'thread_sdk_11', channelId: 'ch_builders', name: 'SDK migration checklist', text: 'Everything we need to sort before the SDK migration goes live. The auth handshake changed, three endpoints were renamed, and the old polling fallback disappears at the end of the month. Check off what you have verified and flag anything still red.' },
  { id: 'thread_types_8', channelId: 'ch_builders', name: 'Type-safety push', text: 'Where should we invest to make the codebase safer this quarter? The payments module is still half untyped and every incident review points at the same any-shaped hole. Propose the highest-leverage files and we will carve out review bandwidth.' },
  { id: 'thread_retention_5', channelId: 'ch_product', name: 'Retention experiments', text: 'Which retention experiments are worth running next? Week-four churn ticked up after the pricing change, but the new checklist emails show early promise. Pitch one experiment with a falsifiable metric and we will fund the top three.' },
  { id: 'thread_tokens_6', channelId: 'ch_design', name: 'Design token audit', text: 'Auditing our tokens before the dark-mode rollout — flag any oddities. A few legacy hex values slipped past the last migration and contrast fails on at least four surfaces. Comment with the token name and a screenshot of the breakage.' },
  { id: 'thread_empty_3', channelId: 'ch_design', name: 'Empty states revamp', text: 'Gathering ideas for better empty states across the app. Right now half of them are a grey box with a shrug, and the analytics say users bounce instead of taking the next step. Share your favorite examples from other products for inspiration.' },
  { id: 'thread_intros_2', channelId: 'ch_introductions', name: 'Member spotlights', text: 'Nominations for the monthly member spotlight. We want the quiet helpers this time — the people answering questions at midnight and reviewing darkest-hour pull requests. Name your pick and tell us the moment that won you over.' },
  { id: 'thread_support_14', channelId: 'ch_support', name: 'Top support tickets', text: 'The recurring tickets we keep seeing — what should we fix at the root? Webhook timeouts and the CSV import row limit dominate the queue again this month. Vote on the pain you feel most so engineering can justify the sprint time.' },
  { id: 'thread_events_7', channelId: 'ch_events', name: 'Workshop line-up', text: 'Vote on the workshop topics you want to see next month. Advanced caching and the testing masterclass are neck and neck, and someone proposed a live incident-response drill. Poll closes Friday so the hosts have time to prepare.' },
  { id: 'thread_memes_13', channelId: 'ch_memes', name: 'Best of the month', text: 'Post your favorite memes from this month for the recap. The deploy-freeze saga and the great emoji outage both deserve immortality, and rumor says the design team has a folder. Highest reacted post gets pinned in the hall of fame.' },
  { id: 'thread_hack_16', channelId: 'ch_builders', name: 'Hackathon ideas', text: 'Drop your wildest hackathon project ideas for the summer event. Last year somebody shipped a voice-controlled deploy bot in 36 hours, so the bar is gloriously unhinged. Teams form next week — pitch early to recruit the best builders.' },
]
const threadWords = Object.fromEntries(THREADS.map((t) => [t.id, t.text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)]))

// ---------------------------------------------------------------------------
// Author pools by archetype
// ---------------------------------------------------------------------------
const humans = members.filter((m) => !m.bot)
const byArch = Object.fromEntries(['superuser', 'contributor', 'regular', 'lurker', 'new'].map((a) => [a, humans.filter((m) => m.archetype === a)]))
for (const a of Object.keys(byArch)) if (!byArch[a].length) byArch[a] = []
const archWeight = { superuser: 22, contributor: 14, regular: 6, lurker: 1.5, new: 4 }
// Per-member daily participation: the chance a member appears at all on a given
// day. archWeight already controls how LOUD someone is once they show up, but on
// its own it gave all 1349 authors near-identical presence -- with ~639 messages
// a day spread over the full pool, every author was picked most days, so every
// member's last sighting landed within days of the corpus end. That flattened
// the engagement story, left the tier distribution and the "At risk" segment
// empty, and forced leave dates to pile up in the final week (a member who was
// active yesterday can only leave after their own last message). Gating each
// member per day produces the long tail real communities have: power users here
// daily, everyone else drifting in and out on their own cadence.
const dailyRate = { superuser: 0.9, contributor: 0.6, regular: 0.25, lurker: 0.02, new: 0.2 }
const joinAt = (m) => lOn(m.joinedAt)
// A member may post on their join day, but the author pools are per-day, so a
// timestamp placed earlier in that day can still land before their join instant.
// Clamping the placement time (rather than the pick) keeps the member's own
// first-activity timestamp honest -- clamping the author would bias authorship
// toward late joiners.
//
// The +1h matters. toIso() writes UTC components with a "+01:00" suffix, so a
// generated instant ms reads back as Date.parse(iso) === ms - 1h; the app
// re-adds that hour at load (src/data/index.ts `shift`) to get Lagos wall-clock.
// Comparing raw ms against joinAt would therefore pass in the generator and
// still emit an activity timestamp an hour before the member joined. Clamping to
// joinAt + 1h keeps the invariant true in BOTH readings: the raw JSON and the
// shift-corrected app view.
const JOIN_SHIFT = 3600000
const notBeforeJoin = (m, ms) => Math.max(ms, joinAt(m) + JOIN_SHIFT)

// members who must stay voice-only (no messages, no reactions anywhere)
const VOICE_ONLY_COUNT = 36
// Excludes the injected cohort: voice-only members are drawn from the seeded
// inactive/lurker pool, and admitting 240 extra candidates would reshuffle which
// of the original roster gets a voice session, changing a corpus already tuned.
const cohortIds = new Set(members.slice(cohortStart).map((m) => m.id))
const voiceOnlyCandidates = humans.filter((m) => !cohortIds.has(m.id) && ['inactive', 'lurker'].includes(m.archetype))
const voiceOnly = pickN(voiceOnlyCandidates, VOICE_ONLY_COUNT, 'voice-only-select')
const voiceOnlyIds = new Set(voiceOnly.map((m) => m.id))
const usableAuthors = humans.filter((m) => !voiceOnlyIds.has(m.id))

const dailyEligible = new Map()
// Strict `<` on the day boundary, not `<= dayMs + DAY`: that form admitted a
// member for the whole of the day BEFORE their join timestamp, so a message
// placed early in that day could be stamped before they joined -- 136 members
// were active before their own joinedAt. A member joins on a day, and may post
// in it, but the pool for a day must not include anyone whose join timestamp is
// at or after that day's end.
function eligibleFor(dayMs) {
  const key = Math.floor(dayMs / DAY)
  let cached = dailyEligible.get(key)
  if (!cached) {
    cached = usableAuthors.filter((m) => joinAt(m) < dayMs + DAY)
    dailyEligible.set(key, cached)
  }
  return cached
}
const dailyPool = new Map()
const buildPool = (membersList) => {
  const prefix = []
  const weights = []
  let total = 0
  for (const m of membersList) {
    total += archWeight[m.archetype]
    prefix.push(total)
    weights.push(archWeight[m.archetype])
  }
  return { membersList, prefix, weights, total }
}
function poolFor(dayMs) {
  const key = Math.floor(dayMs / DAY)
  let pool = dailyPool.get(key)
  if (pool) return pool
  const eligible = eligibleFor(dayMs).filter((m) => archWeight[m.archetype] || 0 > 0)
  // Seeded on member id AND day, so each member gets an independent daily draw
  // that is stable across runs without correlating one member's cadence with
  // another's.
  const membersList = eligible.filter((m) => hash(`active:${m.id}:${key}`) / 4294967296 < dailyRate[m.archetype])
  // A quiet day can gate out every author of a rare archetype; fall back to the
  // ungated roster so a day never tries to post with an empty pool.
  pool = buildPool(membersList.length ? membersList : eligible)
  dailyPool.set(key, pool)
  return pool
}
function weightedPick(pool, seed) {
  if (!pool.total) return pool.membersList[0]
  const r = hash(seed) % 1000000 / 1000000 * pool.total
  let lo = 0, hi = pool.prefix.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (pool.prefix[mid] >= r) hi = mid
    else lo = mid + 1
  }
  return pool.membersList[Math.min(lo, pool.membersList.length - 1)]
}
function authorPick(dayMs, seed) {
  return weightedPick(poolFor(dayMs), seed)
}
const authorById = new Map(members.map((m) => [m.id, m]))

// ---------------------------------------------------------------------------
// Latent community structure for the relationship graph.
// Every active member belongs to one of five communities (COMMUNITY_COUNT,
// roughly equal size). Each community has a deterministic hub core â€” the
// highest-archetype members â€” that interacts mostly with itself, so Louvain
// sees a dense core plus attached regulars inside a 30-day window. Interaction
// targets concentrate in the author's community (CIRCLE_P personal circle,
// CONC_P anywhere in the community); a dedicated share (BRIDGE_P) targets a
// small roster of "bridge members", each with exclusive cross-community
// companions, so a handful of members genuinely span two or more surfaced
// clusters; a sliver of random cross-community mixing keeps the graph organic.
// ---------------------------------------------------------------------------
const COMMUNITY_COUNT = Number(process.env.MC_COMMUNITIES) || 5
const cfgNum = (key, def) => Number(process.env[key] !== undefined ? process.env[key] : def)
const CIRCLE_P = cfgNum('MC_CIRCLE', 0.18) // fraction of targets from the author's personal circle
const BRIDGE_P = cfgNum('MC_BRIDGE', 0.08) // cross-community share for ordinary members
const BRIDGE_P_BRIDGE = cfgNum('MC_BRIDGE_BRIDGE', 0.3) // cross-community share for designated bridge members
const CONC_P = cfgNum('MC_CONC', 0.65) // fraction of targets from anywhere in the author's community
const CROSS_P = cfgNum('MC_CROSS', 0.02) // fraction of targets drawn randomly cross-community
const CIRCLE_SIZE = cfgNum('MC_CIRCLE_SIZE', 4) // personal circle size
const HUB_COUNT = cfgNum('MC_HUB', 18) // hub-core members per community
const HUB_BOOST = cfgNum('MC_HUB_BOOST', 2) // target-weight multiplier for hub members
const BRIDGE_TARGET = cfgNum('MC_BRIDGES', 10) // designated bridge members
const BRIDGE_COMPANIONS = cfgNum('MC_BRIDGE_COMP', 3) // max cross-community companions per bridge
// Share of non-authoring members who are ever picked as a reactor or replier.
// Every real community has a long tail that joins, reads, and never registers a
// single event; without this gate reactorPick() draws from the whole roster, so
// over a six-month corpus nearly every member replies or reacts at least once.
// That made "Active Members" read ~95% of the roster, left the Inactive tier
// almost empty, and gave the Overview's churn story nothing to contrast against.
// Hubs and designated bridges are exempt so the social graph keeps its spine.
const RESPONDER_P = cfgNum('MC_RESPONDER', 0.3)
const archRank = (a, b) => (archWeight[b.archetype] || 0) - (archWeight[a.archetype] || 0) || (a.id < b.id ? -1 : 1)

const communityId = new Map(usableAuthors.map((m) => [m.id, hash('community:' + m.id) % COMMUNITY_COUNT]))
const communityMembers = Array.from({ length: COMMUNITY_COUNT }, () => [])
for (const m of usableAuthors) communityMembers[communityId.get(m.id)].push(m)
for (const arr of communityMembers) arr.sort((a, b) => (a.id < b.id ? -1 : 1))

const hubSetPerCommunity = communityMembers.map((arr) => [...arr].sort(archRank).slice(0, HUB_COUNT).map((m) => m.id))
const hubIds = new Set(hubSetPerCommunity.flat())
const nonHubMembers = communityMembers.map((arr) => arr.filter((m) => !hubIds.has(m.id)))
const hubMembers = hubSetPerCommunity.map((ids) => ids.map((id) => authorById.get(id)))

const companions = new Map()
for (const m of usableAuthors) {
  const g = communityId.get(m.id)
  const same = communityMembers[g].filter((x) => x.id !== m.id)
  const circle = []
  for (let k = 0; k < CIRCLE_SIZE && same.length; k++) circle.push(same[hash('cmp:' + m.id + ':' + k) % same.length])
  companions.set(m.id, circle)
}

// Bridge roster: active non-hub members, spread evenly across communities.
const bridgeRoster = []
const bridgeSeen = new Set()
for (let g = 0; g < COMMUNITY_COUNT && bridgeRoster.length < BRIDGE_TARGET; g++) {
  const pool = nonHubMembers[g].sort(archRank).slice(0, 80)
  for (let k = 0; k < 2 && pool.length && bridgeRoster.length < BRIDGE_TARGET; k++) {
    const m = pool[hash('bridge:R:' + g + ':' + k) % pool.length]
    if (!bridgeSeen.has(m.id)) { bridgeSeen.add(m.id); bridgeRoster.push(m) }
  }
}
{
  const rest = [...usableAuthors].filter((m) => !bridgeSeen.has(m.id) && !hubIds.has(m.id)).sort(archRank)
  let k = 0
  while (bridgeRoster.length < BRIDGE_TARGET && rest.length) {
    const m = rest[hash('bridge:R:x:' + k++) % rest.length]
    if (!bridgeSeen.has(m.id)) { bridgeSeen.add(m.id); bridgeRoster.push(m) }
  }
}
const bridgeCompanions = new Map()
const usedCompanion = new Set()
for (const m of bridgeRoster) {
  const g = communityId.get(m.id)
  const others = []
  for (let o = 1; o < COMMUNITY_COUNT; o++) others.push((g + o) % COMMUNITY_COUNT)
  const list = []
  const seen = new Set()
  const n = 2 + (hash('bridge:n:' + m.id) % Math.max(1, BRIDGE_COMPANIONS - 1))
  for (let b = 0; b < n && others.length; b++) {
    const oi = hash('bridge:C:' + m.id + ':' + b) % others.length
    const cg = others.splice(oi, 1)[0]
    const pool = communityMembers[cg].filter((x) => x.id !== m.id && !seen.has(x.id) && !usedCompanion.has(x.id) && !bridgeSeen.has(x.id)).sort(archRank).slice(0, 60)
    if (!pool.length) continue
    const idx = hash('bridge:P:' + m.id + ':' + b) % pool.length
    seen.add(pool[idx].id)
    usedCompanion.add(pool[idx].id)
    list.push(pool[idx])
  }
  if (list.length) bridgeCompanions.set(m.id, list)
}

// Members allowed to ever appear as a reactor or a replier. Hubs, bridges and
// bridge companions are always in: they are the connective tissue of the network,
// and dropping them would change the graph's structure rather than its
// participation rate. That is ~120 members of structural exemptions.
const responderIds = new Set()
for (const m of usableAuthors) {
  const structural = hubIds.has(m.id) || bridgeSeen.has(m.id) || bridgeCompanions.has(m.id) || usedCompanion.has(m.id)
  if (structural || (hash('responder:' + m.id) % 1000000) / 1000000 < RESPONDER_P) responderIds.add(m.id)
}

// Weighted target pick inside a community: hubs get HUB_BOOST so interaction
// concentrates on the core; hub authors keep targeting fellow hubs (dense
// hub-core), regulars see the full community with hubs front-loaded.
const targetCache = new Map()
function communityTarget(g, isHub, excludeId, dayMs, seed) {
  const key = Math.floor(dayMs / DAY) + '|' + g + '|' + (isHub ? 'H' : 'M')
  let pool = targetCache.get(key)
  if (!pool) {
    const list = []
    const source = isHub ? hubMembers[g] : [...hubMembers[g], ...nonHubMembers[g]]
    for (const m of source) if (responderIds.has(m.id) && joinAt(m) < dayMs + DAY) list.push(m)
    const prefix = []
    let total = 0
    for (const m of list) {
      total += (archWeight[m.archetype] || 1) * (hubIds.has(m.id) ? HUB_BOOST : 1)
      prefix.push(total)
    }
    pool = { list, prefix, total }
    targetCache.set(key, pool)
  }
  if (!pool.total) return null
  let lo = 0
  let hi = pool.prefix.length
  const r = (hash(seed) % 1000000) / 1000000 * pool.total
  while (lo < hi) { const mid = (lo + hi) >> 1; if (pool.prefix[mid] >= r) hi = mid; else lo = mid + 1 }
  let m = pool.list[Math.min(lo, pool.list.length - 1)]
  if (pool.list.length > 1) {
    let guard = 0
    while (m.id === excludeId && guard++ < 12) {
      const rx = (hash(seed + ':x' + guard) % 1000000) / 1000000 * pool.total
      let l2 = 0
      let h2 = pool.prefix.length
      while (l2 < h2) { const mid = (l2 + h2) >> 1; if (pool.prefix[mid] >= rx) h2 = mid; else l2 = mid + 1 }
      m = pool.list[Math.min(l2, pool.list.length - 1)]
    }
  }
  return m
}
function reactorPick(excludeId, dayMs, seed) {
  const r = (hash(seed + ':mode') % 1000) / 1000
  const circle = (companions.get(excludeId) || []).filter((c) => responderIds.has(c.id) && joinAt(c) < dayMs + DAY)
  if (r < CIRCLE_P && circle.length) return circle[hash(seed + ':cm') % circle.length]
  const g = communityId.get(excludeId)
  const isBridge = bridgeCompanions.has(excludeId)
  const pBridge = isBridge ? BRIDGE_P_BRIDGE : BRIDGE_P
  const pConc = isBridge ? Math.max(0.1, CONC_P - (pBridge - BRIDGE_P)) : CONC_P
  if (g !== undefined && r < CIRCLE_P + pBridge) {
    const bc = bridgeCompanions.get(excludeId)
    if (bc && bc.length) {
      const alive = bc.filter((c) => responderIds.has(c.id) && joinAt(c) < dayMs + DAY)
      if (alive.length) return alive[hash(seed + ':bm') % alive.length]
    }
  }
  if (g !== undefined && r < CIRCLE_P + pBridge + pConc) {
    const t = communityTarget(g, hubIds.has(excludeId), excludeId, dayMs, seed + ':cg')
    if (t) return t
  }
  if (g !== undefined && r < CIRCLE_P + pBridge + pConc + CROSS_P) {
    const cg = (g + 1 + (hash(seed + ':xg') % (COMMUNITY_COUNT - 1))) % COMMUNITY_COUNT
    const t = communityTarget(cg, false, excludeId, dayMs, seed + ':xgm')
    if (t) return t
  }
  if (g !== undefined) {
    const t = communityTarget(g, hubIds.has(excludeId), excludeId, dayMs, seed + ':fb')
    if (t) return t
  }
// Last resort: the day's author pool. Still responder-gated, because this path
// fires most often on quiet/early days when a community pool is too small, and
// an ungated pick here would quietly reintroduce members the gate excludes.
// Returns null rather than a non-responder so the caller can skip the row
// entirely instead of recording an interaction from someone who never engages.
const pool = poolFor(dayMs)
for (let guard = 0; guard < 12; guard++) {
  const m = weightedPick(pool, guard ? seed + ':x' + guard : seed)
  if (m.id !== excludeId && responderIds.has(m.id)) return m
}
return null
}

// ---------------------------------------------------------------------------
// Per-weekday activity model.
// Weekdays: trough 12am-6am, ramp after 7am, a clearly-lower midday dip
// (9am-5pm), evening peak 6-10pm, taper into late night. Each weekday has a
// distinct shape: its own peak hour, dip depth, and evening tail (sharp spike
// vs broad plateau vs late-night Friday). Weekends: later ramp (10am+), no
// workday dip, elevated afternoon, and an EARLIER evening peak (~5-6pm) with
// a fast taper so weekends read differently from weekdays. Every hour gets
// +/-10% organic jitter and rare outlier days (spike/quiet) are layered in
// dailyTarget.
// ---------------------------------------------------------------------------
const DAY_MODEL = [
  { wd: 0, weekend: true, peak: 17, scale: 0.88 },  // Sun: early peak
  { wd: 1, weekend: false, peak: 20, scale: 0.95, dip: 1.0, tail: [75, 50, 28] }, // Mon: standard
  { wd: 2, weekend: false, peak: 18, scale: 0.85, dip: 1.0, tail: [64, 42, 24] }, // Tue: sharp spike, fast taper
  { wd: 3, weekend: false, peak: 19, scale: 1.05, dip: 1.15, tail: [75, 50, 28] }, // Wed: shallow dip
  { wd: 4, weekend: false, peak: 20, scale: 1.12, dip: 1.0, tail: [82, 64, 40] }, // Thu: broad plateau, loud
  { wd: 5, weekend: false, peak: 21, scale: 1.10, dip: 1.35, tail: [85, 70, 48] }, // Fri: soft dip, late night
  { wd: 6, weekend: true, peak: 18, scale: 1.0 },   // Sat: peak an hour later than Sun
]
function dayParam(dayMs) { return DAY_MODEL[new Date(dayMs).getUTCDay()] }
function buildCurve(dayMs) {
  const p = dayParam(dayMs)
  const w = []
  for (let h = 0; h < 24; h++) {
    let v
    if (p.weekend) {
      if (h <= 6) v = 2
      else if (h === 7) v = 4
      else if (h === 8) v = 9
      else if (h === 9) v = 16
      else if (h >= 10 && h <= 14) v = 32 + (h - 10) * 4
      else if (h === 15) v = 52
      else if (h >= 16 && h <= p.peak) v = 68 + ((h - 16) / Math.max(1, p.peak - 16)) * 26
      else if (h === p.peak + 1) v = 72
      else if (h === p.peak + 2) v = 54
      else if (h === p.peak + 3) v = 40
      else if (h === p.peak + 4) v = 30
      else if (h === p.peak + 5) v = 16
      else v = 12
    } else {
      if (h <= 6) v = 2
      else if (h === 7) v = 8
      else if (h === 8) v = 16
      else if (h >= 9 && h <= 16) v = (18 + (h - 9) * 1.5) * (p.dip || 1)
      else if (h >= 17 && h <= p.peak) v = 30 + ((h - 16) / (p.peak - 16)) * 64
      else if (h === p.peak + 1) v = p.tail[0]
      else if (h === p.peak + 2) v = p.tail[1]
      else if (h === p.peak + 3) v = p.tail[2]
      else v = 14
    }
    const nz = (hash('hn:' + Math.floor(dayMs / DAY) + ':' + h) % 1000) / 1000
    w[h] = Math.max(1, Math.round(v * p.scale * (1 + (nz - 0.5) * 0.2)))
  }
  return w
}
const curveCache = new Map()
const curveFor = (dayMs) => {
  const k = Math.floor(dayMs / DAY)
  let c = curveCache.get(k)
  if (!c) { c = buildCurve(dayMs); curveCache.set(k, c) }
  return c
}
function hourPickForDay(seed, dayMs) {
  const w = curveFor(dayMs)
  let total = 0; for (const x of w) total += x
  let r = (hash(seed) % 100000) / 100000 * total
  for (let h = 0; h < 24; h++) { r -= w[h]; if (r <= 0) return h }
  return 23
}
function dayScale(dayMs) { return dayParam(dayMs).scale }

// ---------------------------------------------------------------------------
// Daily volume curve (community grows over ~6 months of history)
// ---------------------------------------------------------------------------
const HISTORY_START = lOn('2024-03-10T00:00:00+01:00')
const DATA_START = lOn('2024-08-10T00:00:00+01:00') // existing messages begin here
// Idempotency guard: once history has been generated, existing messages already
// contain records predating DATA_START. Skip regenerating history, bursts and
// voice-only sessions so re-runs reproduce the same corpus instead of appending
// a second copy.
// The generator is incremental by design: once history exists on disk it only
// appends the newest period, so re-runs are cheap and reproduce the same corpus.
// That has a sharp edge -- an activity-model change (author pool, per-member
// participation rates) is invisible to a normal run, because the frozen March-
// August history is reused verbatim and only the recent batch is regenerated.
// MC_REBUILD=1 discards the persisted corpus and regenerates everything, and is
// required after touching the activity model.
const hasHistory = !REBUILD && existingMessages.some((m) => lOn(m.timestamp) < DATA_START)
function dailyTarget(dayStart, dayIndex) {
  const ramp = Math.min(1, Math.max(0, (dayIndex) / 170))
  const base = 140 + ramp * 930 // 140/day early -> ~1070/day recent
  const wd = dayScale(dayStart) // per-weekday magnitude +/-15-25%
  const spike = hash('spike:' + Math.floor(dayStart / DAY) % 57) % 9 === 0 ? 1.18 : 1
  const quiet = hash('quiet:' + Math.floor(dayStart / DAY)) % 43 === 0 ? 0.74 : 1 // rare dead day
  const shift = (hash('noise:' + Math.floor(dayStart / DAY)) % 100000) / 100000 * 0.16 - 0.08
  return base * wd * spike * quiet * (1 + shift)
}

// ---------------------------------------------------------------------------
// Generated entities
// ---------------------------------------------------------------------------
const messages = []
const voiceSessions = []
// Ids restart at zero on a rebuild. Continuing from the old maximum would hand
// the regenerated history fresh high ids while replies and reactions still
// pointed at the vanished msg_000001.. range, orphaning every foreign key.
let msgN = REBUILD ? 0 : existingMessages.reduce((n, m) => Math.max(n, parseInt(m.id.replace('msg_', ''), 10)), 0)
let voceN = REBUILD ? 0 : existingVoice.reduce((n, v) => Math.max(n, parseInt(v.id.replace('voice_', ''), 10)), 0)
const nid = (pfx, n, w) => `${pfx}_${pad(n + 1, w)}`
const newMsgId = () => nid('msg', ++msgN, 6)
const newVoiceId = () => nid('voice', ++voceN, 5)

// Channel weights. These used to be measured from the persisted corpus, which
// made generation circular: run 1 seeded its channel mix from the old messages,
// overwrote them, and run 2 then seeded from the new ones -- so a rebuild could
// never settle on identical bytes. The measured shares are now a fixed part of
// the model instead, which keeps the channel mix exactly as it was while making
// generation independent of whatever happens to be on disk.
const CHANNEL_SHARE = {
  ch_general: 0.24143, ch_builders: 0.12858, ch_random: 0.10879, ch_memes: 0.10043,
  ch_product: 0.09001, ch_design: 0.06895, ch_feedback: 0.0695, ch_jobs: 0.04597,
  ch_support: 0.04468, ch_events: 0.04115, ch_introductions: 0.03556, ch_announcements: 0.02495,
}
const chanWeight = {}
for (const c of CHANNELS) chanWeight[c.id] = CHANNEL_SHARE[c.id] ?? 1 / CHANNELS.length
function channelPick(seed) {
  let total = 0; for (const c of CHANNELS) total += chanWeight[c.id]
  let r = (hash(seed) % 100000) / 100000 * total
  for (const c of CHANNELS) { r -= chanWeight[c.id]; if (r <= 0) return c }
  return CHANNELS[0]
}
const threadsByChannel = Object.fromEntries(CHANNELS.map((c) => [c.id, THREADS.filter((t) => t.channelId === c.id)]))
function threadPick(channel, seed) {
  const pool = threadsByChannel[channel.id]
  if (!pool || !pool.length) return null
  return pick(pool, seed)
}

// content builder
function buildContent(channel, thread, author, dayMs, seed) {
  const cat = CATEGORY[channel.id] || 'broad'
  const topicList = TOPICS[cat] || TOPICS.community
  const topic = pick(topicList, seed + ':topic')
  const brand = BRANDS[cat] || 'the project'
  const r = (hash(seed) % 100000) / 100000
  if (thread) {
    const tw = threadWords[thread.id] || []
    const twPick = tw.length ? pick(tw, seed + ':tw') : topic
    const templates = [
      `For the ${thread.name} thread: does anyone have opinions on ${twPick}?`,
      `Bumping ${thread.name} â€” anyone else want to weigh in on ${twPick}?`,
      `Small update on ${thread.name}: I tested ${twPick} over the weekend.`,
      `${thread.name} question: how is the team handling ${twPick}?`,
      `Curious what the plan is for ${twPick}, re: the ${thread.name} topic.`,
      `I keep note-taking on ${thread.name} â€” the ${twPick} angle is interesting.`,
    ]
    return pick(templates, seed)
  }
  if (cat === 'announcement') return pick(ANNOUNCE_LINES, seed)
  if (cat === 'onboarding') {
    const isNew = author.joinedAt && (dayMs - joinAt(author)) < DAY * 14
    return pick(isNew ? INTRO_LINES : WELCOME_LINES, seed)
  }
  if (cat === 'social' && channel.name === 'memes') return pick(MEME_LINES, seed)
  if (cat === 'social' && channel.name === 'random') return pick(MEME_LINES, seed)
  if (cat === 'professional') return pick(JOB_LINES, seed)
  if (cat === 'events') return pick(EVENT_LINES, seed)
  if (cat === 'support') return r < 0.55 ? pick(SUPPORT_LINES, seed) : pick(QUESTION_LINES, seed)
  if (r < 0.28) return pick(QUESTION_LINES, seed)
  if (r < 0.5) return pick(REACTION_LINES, seed)
  if (r < 0.7) {
    const user = pick(usableAuthors, seed + ':u').username || 'there'
    const frame = pick(MENTION_FRAMES, seed)
    return frame.replace('{user}', user).replace('{topic}', topic)
  }
  return pick(FRAMES, seed).replace('{topic}', topic).replace('{brand}', brand)
}
const replyContent = (seed) => pick(REPLY_LINES, seed)

// ---------------------------------------------------------------------------
// Generate history 2024-03-10 .. 2024-08-09
// ---------------------------------------------------------------------------
const REPLY_RATE = 0.34   // fraction of messages receiving >= 1 reply
const REACT_RATE = 0.44   // fraction of messages receiving >= 1 reaction
const THREAD_RATE = 0.16  // fraction of messages living inside threads

if (!hasHistory) {
  let dayStart = HISTORY_START
  let dayIndex = 0
  for (; dayStart < DATA_START; dayStart += DAY, dayIndex++) {
  const target = Math.round(dailyTarget(dayStart, dayIndex))
  for (let i = 0; i < target; i++) {
    const seed = `h:${dayStart}:${i}`
    const hour = hourPickForDay(seed, dayStart)
    let ms = dayStart + hour * 3600000 + rint(seed + ':m', 0, 3599000)
    if (ms > END) continue
    const author = authorPick(dayStart, seed)
    ms = notBeforeJoin(author, ms)
    const channel = channelPick(seed)
    const thread = (hash(seed + ':t') % 100) / 100 < THREAD_RATE ? threadPick(channel, seed) : null
    const id = newMsgId()
    messages.push({
      id,
      authorId: author.id,
      channelId: channel.id,
      timestamp: toIso(ms),
      content: buildContent(channel, thread, author, dayStart, seed),
      threadId: thread ? thread.id : null,
    })
    if (thread) thread.last = ms

  }
  // voice sessions
  const voiceVol = Math.round(dailyTarget(dayStart, dayIndex) * 0.075)
  for (let k = 0; k < voiceVol; k++) {
    const seed = `v:${dayStart}:${k}`
    const hour = hourPickForDay(seed, dayStart)
    const start = dayStart + hour * 3600000 + rint(seed + ':m', 0, 3599000)
    const dur = rint(seed + ':d', 15, 120)
    const minutes = dur
    const member = authorPick(dayStart, seed)
    const vc = pick(voiceChannels, seed)
    const vStart = notBeforeJoin(member, Math.min(start, END - minutes * 60000))
    voiceSessions.push({ id: newVoiceId(), memberId: member.id, channelId: vc.id, startedAt: toIso(vStart), endedAt: toIso(Math.min(vStart + minutes * 60000, END)), durationMinutes: minutes })
  }
}

// ---------------------------------------------------------------------------
// Voice-only members â€” split from messages entirely, active in recent window
// ---------------------------------------------------------------------------
for (const m of voiceOnly) {
  const sessions = rint('vo:' + m.id, 2, 5)
  for (let k = 0; k < sessions; k++) {
    const seed = 'vo:' + m.id + ':' + k
    const withinDays = k < 2 ? rint(seed + ':w', 1, 7) : rint(seed + ':w2', 8, 30)
    const dayStartMs = END - withinDays * DAY
    const hour = hourPickForDay(seed, dayStartMs)
    const dur = rint(seed + ':d', 20, 110)
    // Capped so endedAt never passes END: a voice session starting on the final
    // day used to spill its end into the next calendar day, which put records
    // outside the schema date range the app renders its picker from.
    const startMs = notBeforeJoin(m, Math.min(dayStartMs + hour * 3600000 + rint(seed + ':t', 0, 3599000), END - dur * 60000))
    const vc = pick(voiceChannels, seed)
    voiceSessions.push({ id: newVoiceId(), memberId: m.id, channelId: vc.id, startedAt: toIso(startMs), endedAt: toIso(Math.min(startMs + dur * 60000, END)), durationMinutes: dur })
  }
}

// ---------------------------------------------------------------------------
// Recent thread burst â€” gives "trending conversations" believable velocity
// ---------------------------------------------------------------------------
const burstTargets = ['thread_sdk_11', 'thread_types_8', 'thread_retention_5', 'thread_tokens_6', 'thread_intros_2', 'thread_support_14']
for (const tid of burstTargets) {
  const t = THREADS.find((x) => x.id === tid)
  const channel = CHANNELS.find((c) => c.id === t.channelId)
  const burst = rint('burst:' + tid, 7, 12)
  for (let k = 0; k < burst; k++) {
    const seed = `b:${tid}:${k}`
    const ms = END - rint(seed + ':a', 0, 120 * 60000) // within last 2h
    const author = authorPick(ms, seed)
    const content = buildContent(channel, t, author, ms, seed)
    const id = newMsgId()
    messages.push({ id, authorId: author.id, channelId: channel.id, timestamp: toIso(ms), content, threadId: tid })
  }
}
}

// ---------------------------------------------------------------------------
// Enrich EXISTING messages: vary content, expand threading, offset reactions
// ---------------------------------------------------------------------------
function channelById(cid) { return CHANNELS.find((c) => c.id === cid) || CHANNELS[0] }

for (let i = 0; i < existingMessages.length; i++) {
  const m = existingMessages[i]
  const seed = 'x:' + m.id
  const channel = channelById(m.channelId)
  const author = authorById.get(m.authorId) || { id: m.authorId, displayName: 'Member', archetype: 'regular' }
  let thread = m.threadId ? THREADS.find((t) => t.id === m.threadId) : null
  if (!thread && (hash(seed + ':ta') % 100) / 100 < 0.05) thread = threadPick(channel, seed)
  m.content = buildContent(channel, thread, author, lOn(m.timestamp), seed)
  if (thread && !m.threadId) m.threadId = thread.id
}
// expand thread membership across existing messages so threads have body
for (let i = 0; i < existingMessages.length; i++) {
  const m = existingMessages[i]
  if (m.threadId) continue
  const ch = channelById(m.channelId)
  const pool = threadsByChannel[ch.id]
  if (!pool || !pool.length) continue
  const seed = 'xt:' + m.id
  if ((hash(seed) % 100) / 100 < 0.03) m.threadId = pick(pool, seed).id
}

// Retime seed timestamps to the per-weekday activity model so on-screen hours
// follow the same organic curve as generated history. Only the hour changes;
// the UTC date is never moved, so per-day metrics (KPI windows, activation,
// retention, activity series) are unaffected. Deterministic per id: a message
// already sitting at its target hour is left alone, so the pass is idempotent.
function retimeToModel(item, tsField) {
  // Work in display space (Lagos = stored instant + 1h), matching the app's
  // data barrel, so both the current hour and the target are display hours and
  // the calendar date is never moved.
  const di = new Date(lOn(item[tsField]) + 3600000)
  const curHour = di.getUTCHours()
  const y = di.getUTCFullYear()
  const mo = di.getUTCMonth()
  const d = di.getUTCDate()
  const dayMs = Date.UTC(y, mo, d)
  const seed = 'mtime:' + item.id
  const target = hourPickForDay(seed, dayMs)
  if (target === curHour) return
  const s = Date.UTC(y, mo, d, target, rint(seed + ':mi', 0, 59), rint(seed + ':s', 0, 59))
  item[tsField] = toIso(s)
}
for (const m of existingMessages) retimeToModel(m, 'timestamp')

// Retime seed voice sessions to the same model (they currently cluster at
// hours 17-22). Preserve durationMinutes; recompute endedAt off the new start.
for (const v of existingVoice) {
  const before = toIso(lOn(v.startedAt))
  retimeToModel(v, 'startedAt')
  if (v.startedAt !== before) v.endedAt = toIso(Math.min(lOn(v.startedAt) + v.durationMinutes * 60000, END))
}

// toIsoAt(ms) writes a +01:00 string whose *parsed* instant equals ms. toIso
// itself renders the UTC clock of an instant with a +01:00 suffix, so a parsed
// timestamp comes back one hour earlier â€” fine for corpus events authored in
// wall-clock terms, wrong when we hold a true instant (reaction offsets).
const toIsoAt = (ms) => toIso(ms + 3600000)

// ---------------------------------------------------------------------------
// Interactions â€” deterministically regenerated every run with affinity bias.
// Replies and reactions derive from the final message corpus (post-retime
// timestamps), so re-runs reproduce byte-identical interaction sets and the
// message aggregates (hasReply / reactions / reactorIds) stay consistent.
// Threads that received a recent "burst" keep their boosted reaction energy.
// ---------------------------------------------------------------------------
const emojiSet = ['ðŸ‘', 'â¤ï¸', 'ðŸ”¥', 'ðŸ‘€', 'ðŸ˜‚', 'ðŸ’¡', 'ðŸš€', 'ðŸŽ‰', 'âœ…', 'ðŸ™']
const burstThreadIds = new Set(['thread_sdk_11', 'thread_types_8', 'thread_retention_5', 'thread_tokens_6', 'thread_intros_2', 'thread_support_14'])
const HOT_WINDOW = 150 * 60000 // a burst thread reads as "hot" for ~2.5h after its last burst message

// ---------------------------------------------------------------------------
// Recent-window volume shaping. The seeded recent window (DATA_START .. END,
// the period every default chart shows) was authored flat (~6% daily stdev),
// so the activity series read as a flat line on the honest 0-axis. History
// already carries texture via dailyTarget (weekday rhythm, spikes, dead
// days); this pass gives the seed window the same treatment without touching
// curated content: days above target lose background chatter, days below
// target gain fresh background messages built with the standard helpers.
// The pass is a pure function of (corpus, target curve): thin victims are
// picked by message-id hash, boosted messages by day-keyed seeds, so once a
// day sits on target the pass no-ops and re-runs reproduce the corpus
// byte-identically (roles settle on the following run — role assignment reads
// activity counts, per the documented settling behavior).
// ---------------------------------------------------------------------------
const RECENT_BASE = 1030 // target daily mean ≈ seed mean once weekday/spike/quiet mix in
function recentTarget(bucket) {
  const wd = DAY_MODEL[new Date(bucket * DAY).getUTCDay()].scale
  const spike = hash('vol:spike:' + bucket) % 100 < 7 ? 2.2 : 1
  const quiet = hash('vol:quiet:' + bucket) % 100 < 4 ? 0.7 : 1
  const nz = (hash('vol:noise:' + bucket) % 100000) / 100000 * 0.16 - 0.08
  return RECENT_BASE * wd * spike * quiet * (1 + nz)
}
{
  // App-space day bucket: the app adds the +1h Lagos shift before bucketing
  // (src/data), so mirror it here or thin/boost targets miss displayed days.
  const appBucket = (iso) => Math.floor((Date.parse(iso) + 3600000) / DAY)
  const bStart = Math.floor((DATA_START + 3600000) / DAY)
  const bEnd = Math.floor((END + 3600000) / DAY)
  const byBucket = new Map()
  for (const m of existingMessages) {
    const b = appBucket(m.timestamp)
    if (b < bStart || b > bEnd) continue
    let arr = byBucket.get(b)
    if (!arr) { arr = []; byBucket.set(b, arr) }
    arr.push(m)
  }
  const culled = new Set()
  for (let b = bStart; b <= bEnd; b++) {
    const arr = byBucket.get(b) || []
    const target = Math.round(recentTarget(b))
    if (arr.length > target) {
      // Thin background chatter only: threaded bodies and hot burst threads
      // stay intact so conversations and trending velocity survive.
      const eligible = arr.filter((m) => !m.threadId || !burstThreadIds.has(m.threadId))
      const victims = eligible
        .map((m) => [hash('vol:thin:' + m.id), m.id])
        .sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1))
        .slice(0, Math.min(arr.length - target, eligible.length))
      for (const [, id] of victims) culled.add(id)
    } else if (arr.length < target) {
      const need = target - arr.length
      const dayStart = b * DAY
      for (let k = 0; k < need; k++) {
        const seed = `vol:boost:${b}:${k}`
        const hour = hourPickForDay(seed + ':h', dayStart) // dayStart carries the bucket's UTC weekday for the hour curve
        const author = authorPick(dayStart, seed + ':a')
        const ms = Math.min(notBeforeJoin(author, Math.min(dayStart + hour * 3600000 + rint(seed + ':ms', 0, 3599999), dayStart + DAY - 1000)), END)
        const channel = channelPick(seed + ':c')
        messages.push({
          id: newMsgId(),
          authorId: author.id,
          channelId: channel.id,
          timestamp: toIso(ms),
          content: buildContent(channel, null, author, dayStart, seed + ':x'),
          threadId: null,
        })
      }
    }
  }
  if (culled.size) {
    for (let i = existingMessages.length - 1; i >= 0; i--) {
      if (culled.has(existingMessages[i].id)) existingMessages.splice(i, 1)
    }
  }
}

const mergedMessages = REBUILD ? messages : [...messages, ...existingMessages].sort((a, b) => lOn(a.timestamp) - lOn(b.timestamp) || (a.id < b.id ? -1 : 1))
const genReplies = []
const genReactions = []
let gRepN = 0
let gReaN = 0

for (const m of mergedMessages) {
  const base = lOn(m.timestamp)
  const seed = 'gi:' + m.id
  const hot = !!m.threadId && burstThreadIds.has(m.threadId) && END - base <= HOT_WINDOW

  // replies (kept within ~1h of the message, matching the original corpus timing;
  // day-spread comes from the author's posting cadence, not the offset width)
  if ((hash(seed + ':r') % 100) / 100 < (hot ? 0.8 : REPLY_RATE)) {
    const nReplies = hot ? 1 : (hash(seed + ':rn') % 5) < 3 ? 1 : 2
    for (let k = 0; k < nReplies; k++) {
      const rms0 = Math.min(base + rint(seed + ':rt' + k, 10, 3600000), END)
const rAuthor = reactorPick(m.authorId, rms0, seed + ':ra' + k)
        // The reactor may have joined after the message they are replying to, so
        // the reply instant is clamped to their own join just like an authored
        // message is.
        if (!rAuthor) continue
        const rms = Math.min(notBeforeJoin(rAuthor, rms0), END)
      // toIsoAt, not toIso: `base` is the PARSED instant of the parent message,
      // while plain toIso emits a string that parses an hour lower. Writing the
      // reply that way stamped 55,396 replies -- nearly all of them -- up to an
      // hour BEFORE the message they answer. toIsoAt writes a string whose
      // parsed instant equals rms, matching how the reactions below were already
      // emitted.
      genReplies.push({ id: nid('reply', ++gRepN, 6), messageId: m.id, authorId: rAuthor.id, timestamp: toIsoAt(rms), content: replyContent(seed + ':rc' + k) })
    }
  }
  // reactions
  if ((hash(seed + ':e') % 100) / 100 < (hot ? 0.75 : REACT_RATE)) {
    const nRx = hot ? rint(seed + ':nh', 2, 4) : ((hash(seed + ':en') % 4) + 1)
    const emojis = pickN(emojiSet, nRx, seed + ':emo')
    for (let k = 0; k < nRx; k++) {
      const rms0 = Math.min(base + rint(seed + ':et' + k, 0, 4 * 3600000), END)
      const reActor = reactorPick(m.authorId, rms0, seed + ':ea' + k)
      if (!reActor) continue
      const rms = Math.min(notBeforeJoin(reActor, rms0), END)
      genReactions.push({ id: nid('reaction', ++gReaN, 6), messageId: m.id, memberId: reActor.id, emoji: emojis[k], timestamp: toIsoAt(rms) })
    }
  }
}

// ---------------------------------------------------------------------------
// Bridge story pass. The natural interaction model gives bridges only a
// probabilistic chance of reaching two other communities with qualifying edges
// (count>=2 across >=2 days) inside a 30-day window, so the Relationships page
// reliably saw zero bridges. This pass makes the story deterministic: for each
// designated bridge member we attach a handful of cross-community reaction rows
// (companions reacting to the bridge's recent messages and vice versa) spread
// across distinct days, so every roster member gains at least two qualifying
// edges into two other surfaced clusters.
// ---------------------------------------------------------------------------
const REL_WINDOW = 30 * DAY
const relStart = END - REL_WINDOW
const authorsInWindow = new Map()
for (const m of mergedMessages) {
  const t = lOn(m.timestamp)
  if (t >= relStart && t <= END) {
    let arr = authorsInWindow.get(m.authorId)
    if (!arr) { arr = []; authorsInWindow.set(m.authorId, arr) }
    arr.push(m)
  }
}
const spreadMsgs = (msgs, n, seed) => {
  if (!msgs || msgs.length === 0) return []
  const byDay = new Map()
  for (const m of msgs) {
    const d = toIso(lOn(m.timestamp)).slice(0, 10)
    let arr = byDay.get(d)
    if (!arr) { arr = []; byDay.set(d, arr) }
    arr.push(m)
  }
  const days = [...byDay.keys()].sort()
  const out = []
  for (let j = 0; j < n; j++) {
    const d = days[j % days.length]
    const arr = byDay.get(d)
    out.push(arr[hash(seed + ':m:' + j) % arr.length])
  }
  return out
}
for (const b of bridgeRoster) {
  const comps = bridgeCompanions.get(b.id)
  if (!comps || comps.length < 2) continue
  const bMsgs = authorsInWindow.get(b.id) || []
  for (const c of comps) {
    const cMsgs = authorsInWindow.get(c.id) || []
    if (!bMsgs.length || !cMsgs.length) continue
    const seedBase = 'bridge:rel:' + b.id + ':' + c.id
    const rxOnB = spreadMsgs(bMsgs, 2, seedBase + ':rb')
    const rxOnC = spreadMsgs(cMsgs, 2, seedBase + ':rc')
    for (let j = 0; j < rxOnB.length; j++) {
      const m = rxOnB[j]
      const t = notBeforeJoin(c, Math.min(lOn(m.timestamp) + j * 3600000 + rint(seedBase + ':tb' + j, 0, 600000), END))
      genReactions.push({ id: nid('reaction', ++gReaN, 6), messageId: m.id, memberId: c.id, emoji: emojiSet[hash(seedBase + ':eb' + j) % emojiSet.length], timestamp: toIsoAt(t) })
    }
    for (let j = 0; j < rxOnC.length; j++) {
      const m = rxOnC[j]
      const t = notBeforeJoin(b, Math.min(lOn(m.timestamp) + j * 3600000 + rint(seedBase + ':tc' + j, 0, 600000), END))
      genReactions.push({ id: nid('reaction', ++gReaN, 6), messageId: m.id, memberId: b.id, emoji: emojiSet[hash(seedBase + ':ec' + j) % emojiSet.length], timestamp: toIsoAt(t) })
    }
  }
}

// ---------------------------------------------------------------------------
// Writers + derived helper files
// ---------------------------------------------------------------------------

// merge everything and sort chronologically
const allMessages = mergedMessages
const allReplies = genReplies.sort((a, b) => lOn(a.timestamp) - lOn(b.timestamp))
const allReactions = genReactions.sort((a, b) => lOn(a.timestamp) - lOn(b.timestamp))
const allVoice = (REBUILD ? voiceSessions : [...voiceSessions, ...existingVoice]).sort((a, b) => lOn(a.startedAt) - lOn(b.startedAt))

// ---------------------------------------------------------------------------
// Server leave events (member.leftAt)
// ---------------------------------------------------------------------------
// Members leave servers. A leave is a membership event and is modelled as one:
// it is a point in time at which the member stopped being on the roster, chosen
// from how long they had been here, NOT from whether they had gone quiet. The
// "Inactive" tier already means "still on the server, not participating", so
// gating leaves on inactivity would double-count one idea as two and would
// leave a member who left mid-busiest-week with no way to exist.
//
// Placement is load-bearing. The block runs off the FINAL corpus, after retiming
// has rewritten every activity timestamp, and immediately before the members
// writer: a leave derived any earlier would be anchored to pre-retime
// timestamps and stop reproducing across runs. Retiming moves the corpus within
// a day, so a stale anchor would smear leaves across the wrong day bucket.
//
// Every input is hash()-seeded on the member id and leftAt is re-derived from
// scratch each run, so the pass is idempotent: repeat runs converge on
// identical bytes rather than accumulating drift.
// Per-archetype leave probability before the recency weight below. Re-fitted
// after the reactive-participation gate (RESPONDER_P) landed: with most of the
// roster now a genuinely non-participating tail, `leaveRecency` saturates for
// the tail (a member who never replied all year reads as ~180 days silent), so
// these values ARE the effective rate for the quiet majority rather than a
// ceiling the ramp rarely reaches. They are an order of magnitude below the
// pre-gate numbers for the same reason: 1230 inactive members at the old 0.7
// would have churned the community down by a third. Together they put six-month
// churn at ~5% of the roster, front-loaded onto lurkers/inactive/new.
const leavePropensity = { superuser: cfgNum('MC_LEAVE_SUPER', 0.0135), contributor: cfgNum('MC_LEAVE_CONTRIB', 0.027), regular: cfgNum('MC_LEAVE_REGULAR', 0.049), lurker: cfgNum('MC_LEAVE_LURKER', 0.084), inactive: cfgNum('MC_LEAVE_INACTIVE', 0.111), new: cfgNum('MC_LEAVE_NEW', 0.122) }
const leaveFloor = (id) => hash(`leave:${id}`) / 4294967296
const leaveAt = (id) => hash(`leave-at:${id}`) / 4294967296
// Leave probability concentrates on members who are already well out of the daily
// conversation. This is a sampling choice, not a definition: an active member can
// still leave, but assigning many leaves to members seen recently forces those
// dates into the same final sliver and recreates the end-of-window pile-up. The
// ramp reaches full weight only after a long silence (~90 days) because the
// mid-dormancy band is where a steep window edge piles leaves onto whichever
// month those members last spoke in -- it produced a 132-leave spike in August
// alone. Members with no corpus activity keep full weight.
const leaveRecency = (daysSilent) => {
  if (daysSilent == null) return 1
  if (daysSilent < 3) return 0.02
  if (daysSilent >= 90) return 1
  return (daysSilent - 3) / 87
}
const lastSubstantive = new Map()
const noteActivity = (id, iso) => {
  if (id == null) return
  const t = Date.parse(iso)
  const prev = lastSubstantive.get(id)
  if (prev === undefined || t > prev) lastSubstantive.set(id, t)
}
// Deliberately messages, replies and voice only -- reactions are excluded. Reactor
// targets are drawn from the whole community rather than the gated daily author
// pool, so almost every member reacts somewhere in the corpus; counting an emoji
// tap as "still engaged" made the median member look seen three days ago and
// pushed every leave date into the final weeks. Anchoring the leave window on
// reactions as well collapsed it outright -- 312 of 315 leaves landed in the
// last two months. Post-leave reactions are dropped below instead.
for (const m of allMessages) noteActivity(m.authorId, m.timestamp)
for (const r of allReplies) noteActivity(r.authorId, r.timestamp)
for (const v of allVoice) noteActivity(v.memberId, v.startedAt)
const leftAtById = new Map()
for (const m of members) {
  m.leftAt = null
  if (m.bot) continue
  const joined = Date.parse(m.joinedAt)
  // A leave is a membership event, not an inactivity state: members leave for
  // reasons that have nothing to do with how loud they were, and the recency
  // weight above only keeps the resulting dates spread across the window.
  const silentSince = lastSubstantive.get(m.id)
  const daysSilent = silentSince == null ? null : Math.floor((END - silentSince) / DAY)
  const propensity = (leavePropensity[m.archetype] ?? 0) * leaveRecency(daysSilent)
  if (propensity <= 0) continue
  if (leaveFloor(m.id) >= propensity) continue
  // Drawn across the member's tenure, then discarded if it would place the leave
  // before their own last sighting. Anchoring instead on the silence onset made
  // every leave date land at-or-after that date, so the leave histogram
  // inherited the lumpiness of *when people last spoke* -- a 133-leave spike in
  // August alone, from one band of members who happened to go quiet that month.
  // Tenure-relative drawing spreads the same population across the whole window
  // and keeps the coherence rule as a discard rather than a shift.
  const tenureStart = joined + 30 * DAY // a member who joined this month is still here by definition
  if (tenureStart >= END) continue
  const left = tenureStart + leaveAt(m.id) * (END - tenureStart)
  // silentSince and joined are parsed from written ISO strings, so they sit an
  // hour below `left`, which is still a generator instant that toIso() will
  // render an hour lower again. Comparing them to `left` directly would leave a
  // 2-hour window in which the emitted leave predates the member's last sighting
  // in the raw file, so both bounds carry the same +1h correction.
  if (left < joined + JOIN_SHIFT) continue
  if (silentSince != null && left < silentSince + JOIN_SHIFT) continue
  m.leftAt = toIso(left)
  leftAtById.set(m.id, left)
}
// A member who left on 20 Aug cannot have reacted to a message on 1 Sep. The app
// derives per-message reaction counts and reactor ids from this file at load
// time (src/data/index.ts), so dropping the rows here keeps those aggregates
// honest instead of leaving ghost activity behind a departed member.
let postLeaveReactions = 0
for (let i = allReactions.length - 1; i >= 0; i--) {
  const r = allReactions[i]
  const left = leftAtById.get(r.memberId)
  if (left != null && Date.parse(r.timestamp) > left) { allReactions.splice(i, 1); postLeaveReactions++ }
}
const presentMembers = members.filter((m) => !m.bot && m.leftAt === null)

write('messages', allMessages)
write('replies', allReplies)
write('reactions', allReactions)
write('voice-sessions', allVoice)
const existingLast = new Map(existingThreads.map((t) => [t.id, t.last]))
write('threads', THREADS.map((t) => ({ ...t, last: t.last ?? existingLast.get(t.id) })))
write('members', members)

// update community date metadata
// memberCount is a point-in-time figure: members who left before the corpus
// ends are no longer on the roster, so counting them would contradict the
// Overview's "Total members as of" total.
community.memberCount = presentMembers.length
write('community', community)

// keep schema.json's dateRange aligned with the generated corpus.
// The start must be the chronological MINIMUM across every written corpus, not
// allMessages[0]: mergedMessages is in insertion order, not sorted, so index 0 is
// an arbitrary message. Reading it as the range start published a date 21 hours
// after the real first message and left 372 records outside the window the app
// builds its date-range picker from. end stays the canonical END_ISO; generation
// clamps to it.
{
  let min = null
  const see = (iso) => { if (min === null || iso < min) min = iso }
  for (const m of allMessages) see(m.timestamp)
  for (const r of allReplies) see(r.timestamp)
  for (const r of allReactions) see(r.timestamp)
  for (const v of allVoice) see(v.startedAt)
  // Compared as strings, not re-emitted through toIso(): every timestamp in the
  // corpus carries a constant +01:00 suffix, so lexical order IS chronological
  // order, and it sidesteps toIso's one-hour re-shift. Routing the minimum back
  // through toIso would declare the range an hour wider than the data.
  schema.dateRange = { start: min, end: END_ISO }
}
write('schema', schema)

// ---------------------------------------------------------------------------
// Segments â€” saved filtered lists. Dynamic segments store criteria and are
// evaluated at render time (membership is never materialized); static
// segments store explicit member ids. Seeds are derived deterministically so
// re-runs reproduce the same segments.json.
// ---------------------------------------------------------------------------
const alphaCores = humans.filter((m) => m.archetype === 'superuser')
const alphaRoster = [...alphaCores, ...pickN(humans.filter((m) => m.archetype === 'contributor'), 40, 'seg:alpha')].sort((a, b) => (a.id < b.id ? -1 : 1))
const segments = [
  { id: 'seg_contributors', name: 'Contributors', kind: 'dynamic', builtIn: true, description: 'Contributor or Superuser activity in the last 28 days.', criteria: { activityTier: ['Contributor', 'Superuser'] } },
  { id: 'seg_new_this_month', name: 'New this month', kind: 'dynamic', builtIn: true, description: 'Members who joined within the last 28 days.', criteria: { joinedWithinDays: 28 } },
  { id: 'seg_at_risk', name: 'At risk', kind: 'dynamic', builtIn: true, description: 'Joined over 60 days ago with no activity in the last 28 days.', criteria: { joinedBeforeDays: 60, activityTier: ['Inactive'] } },
  { id: 'seg_onboarded_7d', name: 'Onboarded last 7 days', kind: 'dynamic', builtIn: true, description: 'Members who joined within the last 7 days.', criteria: { joinedWithinDays: 7 } },
  { id: 'seg_alpha_builders', name: 'Alpha builders', kind: 'static', builtIn: true, description: 'The most active contributor roster.', memberIds: alphaRoster.map((m) => m.id) },
]
write('segments', segments)

// report
const uniqAuthors = new Set(allMessages.map((m) => m.authorId)).size
const uniqVoice = new Set(allVoice.map((m) => m.memberId)).size
console.log(`messages: ${allMessages.length} (authors: ${uniqAuthors})`)
console.log(`replies: ${allReplies.length}`)
console.log(`reactions: ${allReactions.length}`)
console.log(`voiceSessions: ${allVoice.length} (unique members: ${uniqVoice})`)
console.log(`threads: ${THREADS.length} (messages in threads: ${allMessages.filter((m) => m.threadId).length})`)
console.log(`range: ${allMessages[0].timestamp} .. ${allMessages[allMessages.length - 1].timestamp}`)
console.log(`voice-only members: ${voiceOnlyIds.size}`)
const leftCount = members.filter((m) => m.leftAt).length
const joinsIn = (days) => members.filter((m) => !m.bot && Date.parse(m.joinedAt) >= END - days * DAY && Date.parse(m.joinedAt) <= END).length
const leavesIn = (days) => members.filter((m) => m.leftAt && Date.parse(m.leftAt) >= END - days * DAY && Date.parse(m.leftAt) <= END).length
console.log(`members: ${presentMembers.length} present, ${leftCount} left (bots: ${members.filter((m) => m.bot).length})`)
for (const d of [7, 30, 60, 90]) console.log(`  last ${String(d).padStart(3)}d: joined ${String(joinsIn(d)).padStart(4)}  left ${String(leavesIn(d)).padStart(4)}  net ${String(joinsIn(d) - leavesIn(d)).padStart(5)}`)
