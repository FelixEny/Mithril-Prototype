import { Sparkle } from '@phosphor-icons/react'

export function Insight({ children }: { children: React.ReactNode }) {
  return <div className="insight"><Sparkle size={20} weight="fill" color="var(--surface-yellow)"/><span>{children}</span></div>
}