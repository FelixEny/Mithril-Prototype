import { CaretDown, CaretUp } from '@phosphor-icons/react'

export function Change({ v, pp = false, range, caption, unit, invert = false }: { v: number; pp?: boolean; range: number; caption?: string; unit?: string; invert?: boolean }) {
  const goodWhenUp = !invert
  const up = v >= 0
  const good = goodWhenUp ? up : !up
  const n = Math.round(Math.abs(v))
  const dirUp = good === up
  return <span className={`metric-change ${up ? 'positive' : 'negative'}`}><b>{dirUp ? <CaretUp weight="fill" size={16}/> : <CaretDown weight="fill" size={16}/>}{n}{unit ?? (pp ? 'pp' : '%')}</b><em>{caption ?? `vs last ${range}D`}</em></span>
}