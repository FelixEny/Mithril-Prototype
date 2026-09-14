import { useEffect, useRef, useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'

export function Insight({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<'pending' | 'reveal'>('pending')
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) { setPhase('reveal'); io.disconnect() }
    }, { threshold: 0.4 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={`insight${phase === 'reveal' ? ' reveal' : ''}`}><Sparkle className="sparkle" size={20} weight="fill" color="var(--surface-yellow)"/><span>{children}</span></div>
}