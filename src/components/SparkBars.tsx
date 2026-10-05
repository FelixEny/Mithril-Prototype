// A run of vertical bars sized against the tallest bar in the run. `fill` makes
// the bars share the full width of their container, which is what a stat card
// needs; the default fixed-width form is for a narrow slot beside a label.
export function SparkBars({ bars, gray, fill }: { bars: number[]; gray?: boolean; fill?: boolean }) {
  const max = bars.reduce((m, v) => Math.max(m, v), 0)
  // A 7% floor keeps a zero or all-zero run reading as a row of bars rather than
  // an empty box, which would otherwise look like a loading failure.
  return <div className={`spark-bars${gray ? ' gray' : ''}${fill ? ' fill' : ''}`} aria-hidden="true">
    {bars.map((v, i) => <i key={i} style={{ height: `${max ? Math.max(7, (v / max) * 100) : 7}%` }} />)}
  </div>
}
