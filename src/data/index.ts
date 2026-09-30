import channelsUrl from './channels.json?url'
import membersUrl from './members.json?url'
import messagesUrl from './messages.json?url'
import reactionsUrl from './reactions.json?url'
import repliesUrl from './replies.json?url'
import rolesUrl from './roles.json?url'
import threadsUrl from './threads.json?url'
import voiceSessionsUrl from './voice-sessions.json?url'
import schemaUrl from './schema.json?url'
import segmentsUrl from './segments.json?url'
import communityUrl from './community.json?url'

export type Member = { id: string; name: string; username?: string; joinedAt: Date; bot?: boolean; archetype?: string; roles?: string[]; leftAt: Date | null }
export type Role = { id: string; name: string; color: string }
export type Channel = { id: string; name: string }
export type Message = { id: string; memberId: string; channelId: string; conversationId: string; at: Date; hasReply: boolean; reactions: number; reactorIds: string[]; text: string }
export type VoiceSession = { memberId: string; at: Date; minutes: number }
export type Conversation = { id: string; channelId: string; text: string }
export type Reply = { messageId: string; memberId: string; at: Date }
export type Reaction = { messageId: string; memberId: string; at: Date }

// Segments — saved filtered lists. Dynamic segments store criteria evaluated
// at render time; static segments store explicit member ids.
export type SegmentCriteria = {
  archetypes?: string[]
  roles?: string[]
  activityTier?: string[]
  activeWithinDays?: number
  minMessagesWithinDays?: number
  minInfluence?: number
  joinedWithinDays?: number
  joinedBeforeDays?: number
}
export type Segment = { id: string; name: string; kind: 'static' | 'dynamic'; builtIn?: boolean; description?: string; criteria?: SegmentCriteria; memberIds?: string[] }

// The community lives in Africa/Lagos (UTC+1 during the data window). Every
// timestamp is shifted +1h so the existing getUTC* helpers read Lagos wall-clock
// hours instead of raw UTC.
const shift = 3600000
const at = (iso: string) => new Date(Date.parse(iso) + shift)

export type RawMember = { id: string; displayName: string; username?: string; joinedAt: string; bot?: boolean; archetype?: string; roles?: string[]; leftAt?: string | null }
type RawMsg = { id: string; authorId: string; channelId: string; timestamp: string; content?: string; threadId?: string }
type RawReaction = { messageId: string; memberId: string; timestamp: string }
type RawReply = { messageId: string; authorId: string; timestamp: string; content?: string }
type RawVoice = { memberId: string; startedAt: string; durationMinutes: number }

// Live bindings populated by loadData() before any screen renders. Consumers
// import these names and read them at call time (ESM live bindings), but must
// call dashboard/avatars/relationships only after `await loadData()` — App
// gates rendering on readiness.
export let startDate: Date = new Date(0)
export let endDate: Date = new Date(0)
export let channels: Channel[] = []
export let members: Member[] = []
export let roles: Role[] = []
export let conversations: Conversation[] = []
export let messages: Message[] = []
export let voiceSessions: VoiceSession[] = []
export let replies: Reply[] = []
export let reactions: Reaction[] = []
export let segments: Segment[] = []
export type Community = { id: string; name: string; platform: string; timezone: string; createdAt: Date; memberCount: number; description?: string }
type RawCommunity = { id: string; name: string; platform: string; timezone: string; createdAt: string; memberCount: number; description?: string }
// The community record itself. Nothing but the Overview needed it, but the
// greeting names the community, and hardcoding "Mithril Community" in a page
// would drift from the generated data the moment that changes.
export let community: Community = { id: '', name: 'Community', platform: '', timezone: '', createdAt: new Date(0), memberCount: 0, description: '' }

const loadJson = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}`)
  return res.json()
}

export async function loadData(): Promise<void> {
  const [channelsSrc, membersSrc, messagesSrc, reactionsSrc, repliesSrc, rolesSrc, threadsSrc, voiceSrc, schemaSrc, segmentsSrc, communitySrc] = await Promise.all([
    loadJson(channelsUrl), loadJson(membersUrl), loadJson(messagesUrl), loadJson(reactionsUrl), loadJson(repliesUrl), loadJson(rolesUrl), loadJson(threadsUrl), loadJson(voiceSessionsUrl), loadJson(schemaUrl), loadJson(segmentsUrl), loadJson(communityUrl),
  ])
  const repliesTo = (repliesSrc as RawReply[]).reduce((m, r) => m.add(r.messageId), new Set<string>())
  const reactionAgg = (reactionsSrc as RawReaction[]).reduce((m, r) => {
    let agg = m.get(r.messageId)
    if (!agg) { agg = { total: 0, ids: [] }; m.set(r.messageId, agg) }
    agg.total++
    agg.ids.push(r.memberId)
    return m
  }, new Map<string, { total: number; ids: string[] }>())

  channels = (channelsSrc as { id: string; name: string }[]).map((c) => ({ id: c.id, name: c.name }))
  members = (membersSrc as RawMember[]).map((m) => ({ id: m.id, name: m.displayName, username: m.username, joinedAt: at(m.joinedAt), bot: !!m.bot, archetype: m.archetype, roles: m.roles, leftAt: m.leftAt ? at(m.leftAt) : null }))
  roles = rolesSrc as Role[]
  conversations = (threadsSrc as { id: string; channelId: string; text: string }[]).map((t) => ({ id: t.id, channelId: t.channelId, text: t.text }))
  messages = (messagesSrc as RawMsg[]).map((x) => {
    const agg = reactionAgg.get(x.id)
    return {
      id: x.id,
      memberId: x.authorId,
      channelId: x.channelId,
      conversationId: x.threadId ?? '',
      at: at(x.timestamp),
      hasReply: repliesTo.has(x.id),
      reactions: agg?.total ?? 0,
      reactorIds: agg?.ids ?? [],
      text: x.content ?? '',
    }
  })
  voiceSessions = (voiceSrc as RawVoice[]).map((v) => ({ memberId: v.memberId, at: at(v.startedAt), minutes: v.durationMinutes }))
  replies = (repliesSrc as RawReply[]).map((r) => ({ messageId: r.messageId, memberId: r.authorId, at: at(r.timestamp) }))
  reactions = (reactionsSrc as RawReaction[]).map((r) => ({ messageId: r.messageId, memberId: r.memberId, at: at(r.timestamp) }))
  endDate = at((schemaSrc as { dateRange: { end: string } }).dateRange.end)
  startDate = at((schemaSrc as { dateRange: { start: string } }).dateRange.start)
  segments = segmentsSrc as Segment[]
  const cSrc = communitySrc as RawCommunity
  community = { ...cSrc, createdAt: at(cSrc.createdAt) }
}

// ---------------------------------------------------------------------------
// Roster membership
// ---------------------------------------------------------------------------
// A member leaves the server at a point in time, so "is this person on the
// roster" is a function of WHEN you ask, not a single boolean. Every consumer
// (totals, tiers, retention, segments, network stats) must go through these two
// helpers, otherwise the same member is simultaneously counted and excluded
// depending on which module is asking -- and a "Total members" figure that
// silently included people who left reads as a growing community on a server
// that is actually losing members.
//
// leftAt is inclusive of the departure instant: a member who left on 20 Aug is
// on the roster through 20 Aug and gone from 21 Aug. Bots are never on the
// roster for member-facing counts.
export function joinedBy(m: Member, when: Date): boolean {
  return m.joinedAt.getTime() <= when.getTime()
}
export function presentAt(m: Member, when: Date): boolean {
  if (m.bot) return false
  if (!joinedBy(m, when)) return false
  return m.leftAt === null || m.leftAt.getTime() > when.getTime()
}
// Still on the server at the end of the data window — the roster any
// "right now" total should count.
export function onRoster(m: Member): boolean {
  return m.leftAt === null
}
// Members who joined, left, or both inside [from, to]. Period-scoped membership
// movement, which is the basis for the Overview's New / Left / Net snapshot.
export function membershipFlow(from: Date, to: Date): { joined: Member[]; left: Member[] } {
  const fromMs = from.getTime(), toMs = to.getTime()
  const joined = members.filter((m) => !m.bot && m.joinedAt.getTime() > fromMs && m.joinedAt.getTime() <= toMs)
  const left = members.filter((m) => !m.bot && m.leftAt !== null && m.leftAt.getTime() > fromMs && m.leftAt.getTime() <= toMs)
  return { joined, left }
}