import { Info } from '@phosphor-icons/react'

export function CardTitle({ title, action, meta, info, className = '' }: { title: string; action?: React.ReactNode; meta?: string; info?: string; className?: string }) {
  return <div className={`card-title${action ? '' : ' card-title-no-action'}${className ? ' ' + className : ''}`}><h3>{title}</h3>{info && <span className="card-title-info info-tip" tabIndex={0}><Info size={16} aria-label={`${title} information`} /><span className="tip" role="tooltip"><span className="tip-title">What does this mean?</span><span className="tip-body">{info}</span></span></span>}{action ? <div className="card-title-action">{action}</div> : meta ? <span className="card-title-meta">{meta}</span> : null}</div>
}