import { CaretDown, CaretUp } from '@phosphor-icons/react'

export function Change({ v, pp = false, range, caption }: { v: number; pp?: boolean; range: number; caption?: string }) {
  const up = v >= 0, n = Math.round(Math.abs(v))
  return <span className={`metric-change ${up ? 'positive' : 'negative'}`}><b>{up ? <CaretUp weight="fill" size={12}/> : <CaretDown weight="fill" size={12}/>}{n}{pp ? 'pp' : '%'}</b><em>{caption ?? `vs last ${range}D`}</em></span>
}