import { channels, messages, reactions, voiceSessions } from './data'
import type { Role } from './data'
import { peopleRows } from './people'
import { getMemberAvatar } from './avatars'
import type { AvatarSpec } from './avatars'
import type { ActivityTier } from './analytics'

// Member profile detail model. Built from the shared corpus so the profile
// card, engagement metrics and channel breakdown read the same as the
// People table.
const DAY = 86400000
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface ChannelActivity {
  id: string
  name: string
  count: number
}

export interface ProfileSeriesPoint {
  label: string
  date: string
  messages: number
  reactions: number
}

export interface MemberProfile {
  id: string
  name: string
  username: string | null
  avatar: AvatarSpec
  tier: ActivityTier
  roles: Role[]
  joinedAtMs: number
  lastActiveAtMs: number
  influence: number
  messages: number
  messagesPct: number
  voice: number
  activeDays: number
  activeDaysPct: number
  series: ProfileSeriesPoint[]
  channels: ChannelActivity[]
}

const cache = new Map<string, MemberProfile>()

export function memberProfile(id: string, start: Date, end: Date): MemberProfile {
  const startMs = start.getTime()
  const endMs = end.getTime()
  const key = `${id}|${startMs}|${endMs}`
  const hit = cache.get(key)
  if (hit) return hit

  const row = peopleRows().find((r) => r.id === id) ?? peopleRows()[0]

  const inRange = (t: number) => t >= startMs && t <= endMs
  const allOwn = messages.filter((m) => m.memberId === id)
  const allVoice = voiceSessions.filter((v) => v.memberId === id)
  const allGiven = reactions.filter((r) => r.memberId === id)
  const own = allOwn.filter((m) => inRange(m.at.getTime()))
  const voice = allVoice.filter((v) => inRange(v.at.getTime()))
  const given = allGiven.filter((r) => inRange(r.at.getTime()))

  const priorLen = endMs - startMs
  const prevStart = startMs - priorLen
  const priorOwn = allOwn.filter((m) => m.at.getTime() >= prevStart && m.at.getTime() < startMs)
  const priorGiven = allGiven.filter((r) => r.at.getTime() >= prevStart && r.at.getTime() < startMs)
  const priorVoice = allVoice.filter((v) => v.at.getTime() >= prevStart && v.at.getTime() < startMs)
  const messagesPct = priorOwn.length ? ((own.length - priorOwn.length) / priorOwn.length) * 100 : 0
  const dayKey = (t: number) => Math.floor(t / DAY)
  const activeDays = new Set([...own, ...given, ...voice].map((x) => dayKey(x.at.getTime()))).size
  const priorDays = new Set([...priorOwn, ...priorGiven, ...priorVoice].map((x) => dayKey(x.at.getTime()))).size
  const activeDaysPct = priorDays ? ((activeDays - priorDays) / priorDays) * 100 : 0

  const series: ProfileSeriesPoint[] = []
  for (let t = startMs; t <= endMs; t += DAY) {
    const dNext = Math.min(t + DAY, endMs + 1)
    const d = new Date(t)
    series.push({
      label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      date: `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`,
      messages: own.filter((m) => m.at.getTime() >= t && m.at.getTime() < dNext).length,
      reactions: given.filter((r) => r.at.getTime() >= t && r.at.getTime() < dNext).length,
    })
  }

  const byChannel = new Map<string, number>()
  for (const m of own) byChannel.set(m.channelId, (byChannel.get(m.channelId) ?? 0) + 1)
  const topChannels: ChannelActivity[] = channels
    .map((c) => ({ id: c.id, name: c.name, count: byChannel.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const profile: MemberProfile = {
    id: row.id,
    name: row.name,
    username: row.username,
    avatar: getMemberAvatar(row.id),
    tier: row.tier,
    roles: row.roles,
    joinedAtMs: row.joinedAtMs,
    lastActiveAtMs: row.lastActiveAtMs,
    influence: row.influence,
    messages: own.length,
    messagesPct,
    voice: voice.length,
    activeDays,
    activeDaysPct,
    series,
    channels: topChannels,
  }
  cache.set(key, profile)
  return profile
}
