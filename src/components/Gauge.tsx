const RAMP: [number, number, number][] = [
  [0xEF, 0x44, 0x44],
  [0xF9, 0x73, 0x16],
  [0xF5, 0x9E, 0x0B],
  [0xEA, 0xB3, 0x08],
  [0x84, 0xCC, 0x16],
  [0x4A, 0xDE, 0x80],
  [0x22, 0xC5, 0x5E],
  [0x15, 0x80, 0x3D]
]

const rampColor = (value: number): string => {
  const t = Math.min(1, Math.max(0, value / 100)) * (RAMP.length - 1)
  const i = Math.floor(t)
  const f = t - i
  const a = RAMP[i]
  const b = RAMP[Math.min(i + 1, RAMP.length - 1)]
  const ch = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f)
  return `rgb(${ch(0)},${ch(1)},${ch(2)})`
}

export function Gauge({ value, children }: { value: number; children?: React.ReactNode }) {
  const p = Math.min(100, Math.max(0, value)) / 100
  const L = Math.PI * 112
  const d = 'M 28 150 A 112 112 0 0 1 252 150'
  return (
    <div className="gauge">
      <svg viewBox="0 0 280 170" role="img" aria-label={`Community score ${Math.round(value)} out of 100`}>
        <path className="gauge-track" d={d} />
        <path className="gauge-value" d={d} style={{ stroke: rampColor(value), strokeDasharray: `${L} ${L}`, strokeDashoffset: L * (1 - p) }} />
      </svg>
      <div className="gauge-center">{children}</div>
    </div>
  )
}