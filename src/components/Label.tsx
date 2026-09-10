import { Info } from '@phosphor-icons/react'

export function Label({ text, info }: { text: string; info?: string }) {
  return (
    <span className="stat-title">
      {text}
      {info && (
        <span className="info-tip" tabIndex={0}>
          <Info size={16} aria-label={`${text} information`}/>
          <span className="tip" role="tooltip">
            <span className="tip-title">What does this mean?</span>
            <span className="tip-body">{info}</span>
          </span>
        </span>
      )}
    </span>
  )
}