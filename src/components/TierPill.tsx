import type { ActivityTier } from '../analytics'

const tierKey = (t: ActivityTier) => t.toLowerCase() as 'superuser' | 'contributor' | 'regular' | 'lurker' | 'inactive'

export function TierPill({ tier }: { tier: ActivityTier }) {
  return <span className={`tier-pill ${tierKey(tier)}`}>{tier}</span>
}