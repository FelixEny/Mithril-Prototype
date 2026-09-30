import { avatarFor, type AvatarSpec } from '../avatars'

export function Avatar({ spec, name, size = 20 }: { spec: AvatarSpec; name: string; size?: number }) {
  const initial = ((name ?? '').trim().charAt(0) ?? '').toUpperCase() || '?'
  if (spec.kind === 'photo' || spec.kind === 'dicebear' || spec.kind === 'pravatar') {
    return <i className="avatar" style={{ width: size, height: size }} title={name}><img src={spec.src ?? undefined} alt={name} /></i>
  }
  return <i className="avatar initials" style={{ width: size, height: size, fontSize: Math.round(size * 0.44), background: spec.color }} title={name}>{initial}</i>
}