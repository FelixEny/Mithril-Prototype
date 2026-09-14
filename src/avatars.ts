import { members } from './data'

// Deterministic avatar assignment per member id, so the same member shows the
// same avatar on every screen. Mix: ~45% real face photos (local), ~15%
// Dicebear, ~10% pravatar photos (i.pravatar.cc), ~30% initials circle tinted
// with the design-system avatar palette.
export type AvatarKind = 'photo' | 'dicebear' | 'pravatar' | 'none'

const hashId = (id: string) => {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return h
}

// Design-system avatar colors (mirrors the --avatar-1..6 tokens in tokens.css):
// Brand purple, Green/200, Brand blue, Yellow, Grayish green, and the red used
// by Dicebear/graph avatars.
export const avatarPalette = ['#693CF3', '#009A47', '#008EFF', '#FDAB00', '#3CAA9F', '#E5484D']

// The 100 downloaded faces live at /avatars/faces/{m|w}_{001..050}.jpg
const facePool = Array.from({ length: 50 }, (_, i) => `/avatars/faces/m_${String(i + 1).padStart(3, '0')}.jpg`)
for (let i = 0; i < 50; i++) facePool.push(`/avatars/faces/w_${String(i + 1).padStart(3, '0')}.jpg`)

const kind = (id: string): AvatarKind => {
  const r = hashId(id) % 100
  if (r < 45) return 'photo'
  if (r < 60) return 'dicebear'
  if (r < 70) return 'pravatar'
  return 'none'
}

export type AvatarSpec = {
  kind: AvatarKind
  seed: string
  src: string | null
  color: string
}

export const avatarFor = (id: string): AvatarSpec => {
  const seed = String(hashId(id) >>> 0)
  const k = kind(id)
  const src = k === 'photo' ? facePool[hashId(id) % facePool.length]
    : k === 'dicebear' ? `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundType=gradientLinear,solid&backgroundColor=693CF3,009A47,008EFF,FDAB00,3CAA9F,E5484D&radius=50`
    : k === 'pravatar' ? `https://i.pravatar.cc/128?img=${1 + (hashId(id) % 70)}`
    : null
  return { kind: k, seed, src, color: avatarPalette[hashId(id) % avatarPalette.length] }
}

// Built lazily from the live `members` binding once data is loaded (App awaits
// loadData() first), so the map is never captured empty at import time.
let avatarMap: Map<string, AvatarSpec> | null = null
export const getMemberAvatar = (id: string): AvatarSpec => {
  if (!avatarMap) avatarMap = new Map(members.map((m) => [m.id, avatarFor(m.id)]))
  return avatarMap.get(id) ?? avatarFor(id)
}