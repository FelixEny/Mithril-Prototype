import type { CSSProperties } from 'react'

export function Sk({ w, h, className = '', style }: { w?: number | string; h?: number | string; className?: string; style?: CSSProperties }) {
  return <span className={`sk ${className}`} style={{ width: w, height: h, ...style }} />
}