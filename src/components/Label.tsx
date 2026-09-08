import { Info } from '@phosphor-icons/react'

export function Label({ text, info = true }: { text: string; info?: boolean }) {
  return <span className="stat-title">{text}{info && <Info size={16} aria-label={`${text} information`}/>}</span>
}