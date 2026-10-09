import { formatNumber, type DashboardWindow } from './analytics'
import { endDate } from './data'

// ---------------------------------------------------------------------------
// Mithril feed
// ---------------------------------------------------------------------------
// Four digest rows in the Overview's bottom-right card. Each row pairs one icon
// with one sentence, and the four deliberately cover four *different* signals
// rather than four readings of the same one -- the Community strength card and the
// four stat cards already sit directly above this, so a feed that repeated either
// would spend its most prominent position restating the page.
//
// Icons map to the digest's subject: gauge for a roster proportion, speaker for a
// time window, lightning for a conversation, hash for a channel. The icon sits in
// the row's leading 48px circle, as in the Figma `Mithril feed` component.
//
// `channel` and `avatars` are the two optional affixes; a row carries whichever the
// underlying datum actually has. `timestamp` is a *third*, rarer affix: only a row
// describing a real event has an occurrence time. The other three are window
// aggregates -- "x% of members are connected", "busiest on Tuesday 6pm" -- and
// printing "2d ago" beside them would assert a moment the data does not have.

export type FeedIcon = 'gauge' | 'speaker' | 'lightning' | 'hash'

export interface FeedItem {
  id: string
  icon: FeedIcon
  headline: string
  supporting: string
  channel?: string
  avatars?: { id: string; name: string }[]
  /**
   * Participants not shown as a face. The Figma stack ends in a brand-filled 20px
   * bubble rather than a fourth avatar, because there is no fourth person to show.
   * `avatars` is capped at 3 for exactly that reason.
   */
  avatarCount?: number
  /** Relative event time, e.g. "3h ago". Only where one honestly exists. */
  timestamp?: string
}

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`)

// Relative to the corpus' own end date, not the wall clock. The generated data
// ends in 2024, so `Date.now()` would render every event as "2y ago" and make the
// whole feed look abandoned.
const ago = (at: Date | null): string | undefined => {
  if (!at) return undefined
  const mins = Math.round((endDate.getTime() - at.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`
}

// `connected` is passed in rather than derived here: it comes from the network
// engine, which is far more expensive than everything else on this page, and the
// Relationships page already calls it for the identical window and caches it.
export function buildMithrilFeed(w: DashboardWindow, connected: { count: number; total: number }): FeedItem[] {
  const out: FeedItem[] = []

  const connectedPct = connected.total ? (connected.count / connected.total) * 100 : 0
  out.push({
    id: 'connected',
    icon: 'gauge',
    headline: `${Math.round(connectedPct)}% of members are connected`,
    supporting: `${formatNumber(connected.count)} of ${formatNumber(connected.total)} have 2 or more meaningful connections`,
  })

  const peak = w.peaks[0]
  if (peak) {
    const span = peak.minHour === peak.maxHour ? hourLabel(peak.minHour) : `${hourLabel(peak.minHour)}–${hourLabel(peak.maxHour + 1)}`
    out.push({
      id: 'peak',
      icon: 'speaker',
      headline: `Busiest on ${DAY_NAMES[peak.weekday]} ${span}`,
      supporting: `${peak.relative.toFixed(1)}× the hourly average, averaging ${formatNumber(Math.round(peak.avgActive))} active members`,
    })
  }

  const discussion = w.discussionRows[0]
  if (discussion) {
    out.push({
      id: 'discussion',
      icon: 'lightning',
      headline: discussion.text,
      supporting: `${formatNumber(discussion.replies)} replies · ${formatNumber(discussion.reactions)} reactions · ${formatNumber(discussion.participants)} taking part`,
      channel: discussion.channel,
      avatars: discussion.avatars,
      avatarCount: Math.max(0, discussion.participants - discussion.avatars.length),
      timestamp: ago(discussion.lastAt),
    })
  }

  const channel = w.channelRows[0]
  if (channel) {
    // No `channel` affix here: the headline is the channel name, so the chip would
    // print "#general (#general)".
    out.push({
      id: 'channel',
      icon: 'hash',
      headline: `#${channel.name}`,
      supporting: `Most active channel · ${formatNumber(channel.messages)} messages · ${formatNumber(channel.active)} active members`,
    })
  }

  return out
}
