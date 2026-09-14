import { CaretDown, CaretUp } from '@phosphor-icons/react'

export function Change({ v, pp = false, range, caption, unit }: { v: number; pp?: boolean; range: number; caption?: string; unit?: string }) {
  const up = v >= 0, n = Math.round(Math.abs(v))
  return <span className={`metric-change ${up ? 'positive' : 'negative'}`}><b>{up ? <CaretUp weight="fill" size={16}/> : <CaretDown weight="fill" size={16}/>}{n}{unit ?? (pp ? 'pp' : '%')}</b><em>{caption ?? `vs last ${range}D`}</em></span>
}