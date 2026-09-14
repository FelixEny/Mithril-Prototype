import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

// ---------------------------------------------------------------------------
// Backdate migration: shift persisted calendar dates from the 2026 launcher
// era back to 2024 so the whole corpus reads as "the first six months of 2024".
// Only the leading year token of each ISO string changes — wall clock,
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
  '{topic} — anyone else seeing this too?',
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
  'Tagging @{user} — this is right up your alley: {topic}.',
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
  'Too real 😅',
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
  'Sounds like the cache — try clearing it.',
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
  'Hey everyone! Just joined — nice to meet you all.',
  'Happy to be here! I build {topic}.',
  'New here, looking forward to learning from the community.',
  'Hi there! Been lurking for a while, finally saying hi.',
  'Joined the community — tell me where to start?',
  "Hello! I'm a longtime {topic} enthusiast.",
  'Waving from across the world 👋',
  'Got pointed here by a friend. Great vibes already.',
]
const WELCOME_LINES = [
  'Welcome! Check the pins in #announcements.',
  'Glad you are here! Tell us a bit about yourself.',
  'Welcome aboard 🎉',
  'Make sure to read the community guidelines when you can.',
  'Welcome! Grab a role from the list below.',
  'Hey, welcome! Great community spirit in here.',
  'Welcome 🎉 Feel free to ask anything.',
  'Welcome! The #introductions thread is a great start.',
]
const ANNOUNCE_LINES = [
  'Reminder: office hours are tomorrow at 18:00.',
  'We shipped a big update — check the changelog.',
  'Call for contributors for the community program.',
  'Voting for this month\u2019s featured project opens Friday.',
  'Maintenance window scheduled for Sunday 02:00.',
  'New cohort for the mentorship program is open.',
  'Version 2.4 lands this week with a major rework.',
  'Town hall recap is posted in the forum.',
  'Survey closes Friday — 5 minutes to shape the roadmap.',
  'Next community call is Wednesday; bring your questions.',
  'We are hiring! Two roles just opened up.',
  'Event this weekend: builders showcase. Sign up below.',
]
const MEME_LINES = [
  'Accurate 😂',
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
  'We are hiring a senior engineer — remote first.',
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
  'Doors open at 17:00 — see you there.',
  'Stream link will be pinned before the call.',
  'Workshop this weekend: intro to automations.',
  'Town hall moved to Thursday due to schedule conflicts.',
  'Venue change for the meetup — check the event post.',
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
  'I am not so sure — worth stress testing.',
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
// Threads (conversations) — fill the trending-conversations gap
// ---------------------------------------------------------------------------
const THREADS = [
  { id: 'thread_roadmap_4', channelId: 'ch_product', name: 'Q3 roadmap priorities', text: 'Which roadmap item should the community bet on first for Q3?' },
  { id: 'thread_feedback_9', channelId: 'ch_feedback', name: 'Onboarding friction review', text: 'Where do new members hit the most friction in the onboarding flow?' },
  { id: 'thread_launch_15', channelId: 'ch_builders', name: 'Launch-week hotfixes', text: 'Tracking the hotfixes coming out of launch week — help us prioritize.' },
  { id: 'thread_event_21', channelId: 'ch_general', name: 'Community call topics', text: 'What should we cover on the upcoming community call?' },
  { id: 'thread_sdk_11', channelId: 'ch_builders', name: 'SDK migration checklist', text: 'Everything we need to sort before the SDK migration goes live.' },
  { id: 'thread_types_8', channelId: 'ch_builders', name: 'Type-safety push', text: 'Where should we invest to make the codebase safer this quarter?' },
  { id: 'thread_retention_5', channelId: 'ch_product', name: 'Retention experiments', text: 'Which retention experiments are worth running next?' },
  { id: 'thread_tokens_6', channelId: 'ch_design', name: 'Design token audit', text: 'Auditing our tokens before the dark-mode rollout — flag any oddities.' },
  { id: 'thread_empty_3', channelId: 'ch_design', name: 'Empty states revamp', text: 'Gathering ideas for better empty states across the app.' },
  { id: 'thread_intros_2', channelId: 'ch_introductions', name: 'Member spotlights', text: 'Nominations for the monthly member spotlight.' },
  { id: 'thread_support_14', channelId: 'ch_support', name: 'Top support tickets', text: 'The recurring tickets we keep seeing — what should we fix at the root?' },
  { id: 'thread_events_7', channelId: 'ch_events', name: 'Workshop line-up', text: 'Vote on the workshop topics you want to see next month.' },
  { id: 'thread_memes_13', channelId: 'ch_memes', name: 'Best of the month', text: 'Post your favorite memes from this month for the recap.' },
  { id: 'thread_hack_16', channelId: 'ch_builders', name: 'Hackathon ideas', text: 'Drop your wildest hackathon project ideas for the summer event.' },
]
const threadWords = Object.fromEntries(THREADS.map((t) => [t.id, t.text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3)]))

// ---------------------------------------------------------------------------
// Author pools by archetype
// ---------------------------------------------------------------------------
const humans = members.filter((m) => !m.bot)
const byArch = Object.fromEntries(['superuser', 'contributor', 'regular', 'lurker', 'new'].map((a) => [a, humans.filter((m) => m.archetype === a)]))
for (const a of Object.keys(byArch)) if (!byArch[a].length) byArch[a] = []
const archWeight = { superuser: 22, contributor: 14, regular: 6, lurker: 1.5, new: 4 }
const joinAt = (m) => lOn(m.joinedAt)

// members who must stay voice-only (no messages, no reactions anywhere)
const VOICE_ONLY_COUNT = 36
const voiceOnlyCandidates = humans.filter((m) => ['inactive', 'lurker'].includes(m.archetype))
const voiceOnly = pickN(voiceOnlyCandidates, VOICE_ONLY_COUNT, 'voice-only-select')
const voiceOnlyIds = new Set(voiceOnly.map((m) => m.id))
const usableAuthors = humans.filter((m) => !voiceOnlyIds.has(m.id))

const dailyEligible = new Map()
function eligibleFor(dayMs) {
  const key = Math.floor(dayMs / DAY)
  let cached = dailyEligible.get(key)
  if (!cached) {
    cached = usableAuthors.filter((m) => joinAt(m) <= dayMs + DAY)
    dailyEligible.set(key, cached)
  }
  return cached
}
const dailyPool = new Map()
function poolFor(dayMs) {
  const key = Math.floor(dayMs / DAY)
  let pool = dailyPool.get(key)
  if (pool) return pool
  const membersList = eligibleFor(dayMs).filter((m) => archWeight[m.archetype] || 0 > 0)
  const prefix = []
  const weights = []
  let total = 0
  for (const m of membersList) {
    total += archWeight[m.archetype]
    prefix.push(total)
    weights.push(archWeight[m.archetype])
  }
  pool = { membersList, prefix, total }
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
// roughly equal size). Each community has a deterministic hub core — the
// highest-archetype members — that interacts mostly with itself, so Louvain
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
    for (const m of source) if (joinAt(m) <= dayMs + DAY) list.push(m)
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
  const circle = (companions.get(excludeId) || []).filter((c) => joinAt(c) <= dayMs + DAY)
  if (r < CIRCLE_P && circle.length) return circle[hash(seed + ':cm') % circle.length]
  const g = communityId.get(excludeId)
  const isBridge = bridgeCompanions.has(excludeId)
  const pBridge = isBridge ? BRIDGE_P_BRIDGE : BRIDGE_P
  const pConc = isBridge ? Math.max(0.1, CONC_P - (pBridge - BRIDGE_P)) : CONC_P
  if (g !== undefined && r < CIRCLE_P + pBridge) {
    const bc = bridgeCompanions.get(excludeId)
    if (bc && bc.length) {
      const alive = bc.filter((c) => joinAt(c) <= dayMs + DAY)
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
  const pool = poolFor(dayMs)
  let m = weightedPick(pool, seed)
  let guard = 0
  while (m.id === excludeId && guard++ < 12) m = weightedPick(pool, seed + ':x' + guard)
  return m
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
const hasHistory = existingMessages.some((m) => lOn(m.timestamp) < DATA_START)
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
let msgN = existingMessages.reduce((n, m) => Math.max(n, parseInt(m.id.replace('msg_', ''), 10)), 0)
let voceN = existingVoice.reduce((n, v) => Math.max(n, parseInt(v.id.replace('voice_', ''), 10)), 0)
const nid = (pfx, n, w) => `${pfx}_${pad(n + 1, w)}`
const newMsgId = () => nid('msg', ++msgN, 6)
const newVoiceId = () => nid('voice', ++voceN, 5)

// channel weights (source: existing message distribution)
const chanWeight = {}
for (const c of CHANNELS) chanWeight[c.id] = 1
for (const m of existingMessages) chanWeight[m.channelId] = (chanWeight[m.channelId] || 1) + 0
{
  const dist = {}
  let tot = 0
  for (const m of existingMessages) { dist[m.channelId] = (dist[m.channelId] || 0) + 1; tot++ }
  for (const c of CHANNELS) chanWeight[c.id] = (dist[c.id] || 1) / tot
}
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
      `Bumping ${thread.name} — anyone else want to weigh in on ${twPick}?`,
      `Small update on ${thread.name}: I tested ${twPick} over the weekend.`,
      `${thread.name} question: how is the team handling ${twPick}?`,
      `Curious what the plan is for ${twPick}, re: the ${thread.name} topic.`,
      `I keep note-taking on ${thread.name} — the ${twPick} angle is interesting.`,
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
    const ms = dayStart + hour * 3600000 + rint(seed + ':m', 0, 3599000)
    if (ms > END) continue
    const author = authorPick(dayStart, seed)
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
    voiceSessions.push({ id: newVoiceId(), memberId: member.id, channelId: vc.id, startedAt: toIso(Math.min(start, END - minutes * 60000)), endedAt: toIso(Math.min(start + minutes * 60000, END)), durationMinutes: minutes })
  }
}

// ---------------------------------------------------------------------------
// Voice-only members — split from messages entirely, active in recent window
// ---------------------------------------------------------------------------
for (const m of voiceOnly) {
  const sessions = rint('vo:' + m.id, 2, 5)
  for (let k = 0; k < sessions; k++) {
    const seed = 'vo:' + m.id + ':' + k
    const withinDays = k < 2 ? rint(seed + ':w', 0, 7) : rint(seed + ':w2', 8, 30)
    const dayStartMs = END - withinDays * DAY
    const hour = hourPickForDay(seed, dayStartMs)
    const startMs = dayStartMs + hour * 3600000 + rint(seed + ':t', 0, 3599000)
    const dur = rint(seed + ':d', 20, 110)
    const vc = pick(voiceChannels, seed)
    voiceSessions.push({ id: newVoiceId(), memberId: m.id, channelId: vc.id, startedAt: toIso(startMs), endedAt: toIso(Math.min(startMs + dur * 60000, END)), durationMinutes: dur })
  }
}

// ---------------------------------------------------------------------------
// Recent thread burst — gives "trending conversations" believable velocity
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
// timestamp comes back one hour earlier — fine for corpus events authored in
// wall-clock terms, wrong when we hold a true instant (reaction offsets).
const toIsoAt = (ms) => toIso(ms + 3600000)

// ---------------------------------------------------------------------------
// Interactions — deterministically regenerated every run with affinity bias.
// Replies and reactions derive from the final message corpus (post-retime
// timestamps), so re-runs reproduce byte-identical interaction sets and the
// message aggregates (hasReply / reactions / reactorIds) stay consistent.
// Threads that received a recent "burst" keep their boosted reaction energy.
// ---------------------------------------------------------------------------
const emojiSet = ['👍', '❤️', '🔥', '👀', '😂', '💡', '🚀', '🎉', '✅', '🙏']
const burstThreadIds = new Set(['thread_sdk_11', 'thread_types_8', 'thread_retention_5', 'thread_tokens_6', 'thread_intros_2', 'thread_support_14'])
const HOT_WINDOW = 150 * 60000 // a burst thread reads as "hot" for ~2.5h after its last burst message

const mergedMessages = [...messages, ...existingMessages].sort((a, b) => lOn(a.timestamp) - lOn(b.timestamp) || (a.id < b.id ? -1 : 1))
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
      const rms = Math.min(base + rint(seed + ':rt' + k, 10, 3600000), END)
      const rAuthor = reactorPick(m.authorId, rms, seed + ':ra' + k)
      genReplies.push({ id: nid('reply', ++gRepN, 6), messageId: m.id, authorId: rAuthor.id, timestamp: toIso(rms), content: replyContent(seed + ':rc' + k) })
    }
  }
  // reactions
  if ((hash(seed + ':e') % 100) / 100 < (hot ? 0.75 : REACT_RATE)) {
    const nRx = hot ? rint(seed + ':nh', 2, 4) : ((hash(seed + ':en') % 4) + 1)
    const emojis = pickN(emojiSet, nRx, seed + ':emo')
    for (let k = 0; k < nRx; k++) {
      const rms = Math.min(base + rint(seed + ':et' + k, 0, 4 * 3600000), END)
      const reActor = reactorPick(m.authorId, rms, seed + ':ea' + k)
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
      const t = Math.min(lOn(m.timestamp) + j * 3600000 + rint(seedBase + ':tb' + j, 0, 600000), END)
      genReactions.push({ id: nid('reaction', ++gReaN, 6), messageId: m.id, memberId: c.id, emoji: emojiSet[hash(seedBase + ':eb' + j) % emojiSet.length], timestamp: toIsoAt(t) })
    }
    for (let j = 0; j < rxOnC.length; j++) {
      const m = rxOnC[j]
      const t = Math.min(lOn(m.timestamp) + j * 3600000 + rint(seedBase + ':tc' + j, 0, 600000), END)
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
const allVoice = [...voiceSessions, ...existingVoice].sort((a, b) => lOn(a.startedAt) - lOn(b.startedAt))

write('messages', allMessages)
write('replies', allReplies)
write('reactions', allReactions)
write('voice-sessions', allVoice)
const existingLast = new Map(existingThreads.map((t) => [t.id, t.last]))
write('threads', THREADS.map((t) => ({ ...t, last: t.last ?? existingLast.get(t.id) })))
write('members', members)

// update community date metadata
community.memberCount = humans.length
write('community', community)

// keep schema.json's dateRange aligned with the generated corpus
schema.dateRange = { start: allMessages[0].timestamp, end: END_ISO }
write('schema', schema)

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