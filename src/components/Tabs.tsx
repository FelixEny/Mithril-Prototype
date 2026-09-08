export function Tabs({ values, value, onChange }: { values: string[]; value: string; onChange: (x: string) => void }) {
  return <div className="tabs" role="tablist">{values.map(x=><button key={x} role="tab" aria-selected={value===x} className={value===x?'selected':''} onClick={()=>onChange(x)}>{x}</button>)}</div>
}