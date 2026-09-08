export type Member = { id: string; name: string; joinedAt: Date; bot?: boolean }
export type Channel = { id: string; name: string }
export type Message = { id: string; memberId: string; channelId: string; conversationId: string; at: Date; hasReply: boolean; reactions: number; reactorIds: string[]; text: string }
export type VoiceSession = { memberId: string; at: Date; minutes: number }
export type Conversation = { id: string; channelId: string; text: string }

const seeded = (n: number) => () => (n = (n * 1664525 + 1013904223) >>> 0) / 4294967296
const random = seeded(93841)
const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)]
export const endDate = new Date(Date.UTC(2026, 8, 1, 12))
export const channels: Channel[] = ['general','build-log','feedback','introductions','announcements','design-lab','support','off-topic'].map((name, i) => ({ id: `c${i}`, name }))
export const conversations: Conversation[] = [
  ['general','What would make the community dashboard most useful to you?'], ['build-log','First look at our redesigned contributor experience'], ['feedback','Which onboarding friction point should we tackle next?'], ['design-lab','Exploring a new visual direction for community milestones'], ['support','Share your most useful automation tip this week'], ['introductions','Welcome! Tell us what you are building'], ['off-topic','What are you learning this month?'], ['announcements','Office hours are open for questions']
].map(([channel, text], i) => ({ id: `t${i}`, channelId: channels.find(c => c.name === channel)!.id, text }))
export const members: Member[] = Array.from({ length: 1247 }, (_, i) => ({ id: `m${i}`, name: ['Avery','Sam','Jordan','Maya','Noah','Riley','Alex','Taylor'][i % 8] + ` ${i + 1}`, joinedAt: new Date(endDate.getTime() - (8 + Math.floor(random() * 210)) * 86400000), bot: i > 1218 }))
const people = members.filter(m => !m.bot)
export const messages: Message[] = []
for (let day = 0; day < 90; day++) for (let i = 0, count = 78 + Math.floor(random() * 42) + (day % 7 === 2 ? 38 : 0); i < count; i++) {
  const hour = Math.min(23, Math.max(0, Math.floor(8 + random() * 13 + (day % 7 === 2 ? 2 : 0))))
  const author = pick(people.slice(0, 840)); const channel = pick(channels); const thread = pick(conversations.filter(t => t.channelId === channel.id)) || pick(conversations); const reactions = random() > .28 ? 1 + Math.floor(random() * 7) : 0
  messages.push({ id: `msg${messages.length}`, memberId: author.id, channelId: channel.id, conversationId: thread.id, at: new Date(endDate.getTime() - (89 - day) * 86400000 + hour * 3600000 + Math.floor(random() * 3600000)), hasReply: random() > .34, reactions, reactorIds: reactions ? Array.from({ length: Math.min(reactions, 3) }, () => pick(people.slice(0, 1100)).id) : [], text: thread.text })
}
export const voiceSessions: VoiceSession[] = Array.from({ length: 2200 }, () => ({ memberId: pick(people.slice(0, 700)).id, at: new Date(endDate.getTime() - Math.floor(random() * 90) * 86400000 - Math.floor(random() * 86400000)), minutes: 12 + Math.floor(random() * 86) }))

// A sustained current-window pace across several conversations gives the
// Trending Conversations panel believable recent activity without letting
// historical volume drive the signal.
const trending: [string, number][] = [['t0', 8], ['t1', 7], ['t2', 6], ['t3', 5], ['t4', 3]]
let recentIdx = 0
for (const [ci, [convId, count]] of trending.entries()) {
  const thread = conversations.find(c => c.id === convId)!
  for (let i = 0; i < count; i++) {
    messages.push({ id: `recent${recentIdx}`, memberId: people[(recentIdx * 37 + ci * 11) % 200].id, channelId: thread.channelId, conversationId: thread.id, at: new Date(endDate.getTime() - (20 + i * 9 + ci * 5) * 60000), hasReply: true, reactions: 2 + (recentIdx % 4), reactorIds: [pick(people).id, pick(people).id], text: thread.text })
    recentIdx++
  }
}
