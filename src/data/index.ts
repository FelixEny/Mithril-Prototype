import channelsUrl from './channels.json?url'
import membersUrl from './members.json?url'
import messagesUrl from './messages.json?url'
import reactionsUrl from './reactions.json?url'
import repliesUrl from './replies.json?url'
import threadsUrl from './threads.json?url'
import voiceSessionsUrl from './voice-sessions.json?url'
import schemaUrl from './schema.json?url'

export type Member = { id: string; name: string; joinedAt: Date; bot?: boolean }
export type Channel = { id: string; name: string }
export type Message = { id: string; memberId: string; channelId: string; conversationId: string; at: Date; hasReply: boolean; reactions: number; reactorIds: string[]; text: string }
export type VoiceSession = { memberId: string; at: Date; minutes: number }
export type Conversation = { id: string; channelId: string; text: string }
export type Reply = { messageId: string; memberId: string; at: Date }
export type Reaction = { messageId: string; memberId: string; at: Date }

// The community lives in Africa/Lagos (UTC+1 during the data window). Every
// timestamp is shifted +1h so the existing getUTC* helpers read Lagos wall-clock
// hours instead of raw UTC.
const shift = 3600000
const at = (iso: string) => new Date(Date.parse(iso) + shift)

type RawMember = { id: string; displayName: string; joinedAt: string; bot?: boolean }
type RawMsg = { id: string; authorId: string; channelId: string; timestamp: string; content?: string; threadId?: string }
type RawReaction = { messageId: string; memberId: string; timestamp: string }
type RawReply = { messageId: string; authorId: string; timestamp: string; content?: string }
type RawVoice = { memberId: string; startedAt: string; durationMinutes: number }

// Live bindings populated by loadData() before any screen renders. Consumers
// import these names and read them at call time (ESM live bindings), but must
// call dashboard/avatars/relationships only after `await loadData()` — App
// gates rendering on readiness.
export let endDate: Date = new Date(0)
export let channels: Channel[] = []
export let members: Member[] = []
export let conversations: Conversation[] = []
export let messages: Message[] = []
export let voiceSessions: VoiceSession[] = []
export let replies: Reply[] = []
export let reactions: Reaction[] = []

const loadJson = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load ${url}`)
  return res.json()
}

export async function loadData(): Promise<void> {
  const [channelsSrc, membersSrc, messagesSrc, reactionsSrc, repliesSrc, threadsSrc, voiceSrc, schemaSrc] = await Promise.all([
    loadJson(channelsUrl), loadJson(membersUrl), loadJson(messagesUrl), loadJson(reactionsUrl), loadJson(repliesUrl), loadJson(threadsUrl), loadJson(voiceSessionsUrl), loadJson(schemaUrl),
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
  members = (membersSrc as RawMember[]).map((m) => ({ id: m.id, name: m.displayName, joinedAt: at(m.joinedAt), bot: !!m.bot }))
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
}