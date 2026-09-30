import { members } from './data'

// Deterministic avatar assignment per member id, so the same member shows the
// same avatar on every screen. Mix: ~45% real face photos (local), ~15%
// Dicebear, ~10% pravatar photos (i.pravatar.cc), ~30% initials circle tinted
// with the design-system avatar palette.
export type AvatarKind = 'photo' | 'dicebear' | 'pravatar' | 'none'

// --- Initials typography ----------------------------------------------------
// Single source of truth for the size of an avatar's initial. Both the DOM
// Avatar component and the graph's baked atlas read this, so an initials disc
// reads the same everywhere.
//
// Anchors are (disc diameter px, glyph size px) pairs spanning every avatar
// size the UI uses. The glyph/disc ratio eases from ~0.50 at 8px down to ~0.39
// at 88px: a tiny disc needs a relatively larger glyph to stay legible, while a
// large disc needs a relatively smaller one to stay balanced. Interpolated
// between anchors, so in-between sizes (and the atlas cell) get a sensible
// value instead of snapping. With Geist's ~0.73em cap this puts cap height at
// roughly 37% of the disc at 8px easing down to ~28% at 52px and above.
const AVATAR_INITIAL_ANCHORS: readonly (readonly [number, number])[] = [
  [8, 4],
  [20, 9],
  [32, 13],
  [52, 20],
  [88, 34],
]

/**
 * Glyph size in px for a single uppercase initial inside a circular avatar
 * `size` px in diameter.
 */
export const avatarInitialSize = (size: number): number => {
  const anchors = AVATAR_INITIAL_ANCHORS
  if (size <= anchors[0][0]) return anchors[0][1]
  const last = anchors[anchors.length - 1]
  if (size >= last[0]) return last[1]
  for (let i = 0; i < anchors.length - 1; i++) {
    const [fromD, fromG] = anchors[i]
    const [toD, toG] = anchors[i + 1]
    if (size >= fromD && size <= toD) {
      const t = (size - fromD) / (toD - fromD)
      return fromG + t * (toG - fromG)
    }
  }
  return last[1]
}

// A single glyph centred on its ink box still reads a touch low inside a
// circle, because the eye reads the circle's centre as slightly above the
// geometric midpoint. The lift itself lives in tokens.css as
// --avatar-initial-optical-lift (em-relative, so the canvas bake and the DOM
// Avatar can both consume the same single definition).

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
  name?: string
}

export const avatarFor = (id: string): AvatarSpec => {
  const seed = String(hashId(id) >>> 0)
  const k = kind(id)
  const color = avatarPalette[hashId(id) % avatarPalette.length]
  const src = k === 'photo' ? facePool[hashId(id) % facePool.length]
    : k === 'dicebear' ? `https://api.dicebear.com/9.x/adventurer/svg?seed=${seed}&backgroundColor=${color.slice(1)}&radius=50`
    : k === 'pravatar' ? `https://i.pravatar.cc/128?img=${1 + (hashId(id) % 70)}`
    : null
  return { kind: k, seed, src, color }
}

// Built lazily from the live `members` binding once data is loaded (App awaits
// loadData() first), so the map is never captured empty at import time.
let avatarMap: Map<string, AvatarSpec> | null = null
export const getMemberAvatar = (id: string): AvatarSpec => {
  if (!avatarMap) avatarMap = new Map(members.map((m) => [m.id, { ...avatarFor(m.id), name: m.name }]))
  return avatarMap.get(id) ?? avatarFor(id)
}