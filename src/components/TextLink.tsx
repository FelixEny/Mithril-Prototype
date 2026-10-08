import { ArrowRight } from '@phosphor-icons/react'

// Text link with a trailing arrow used for card-title actions ("View chart",
// "Learn more") and insight columns ("View in engagement"). Renders an anchor
// when `href` is provided and a button otherwise; both share the chart-link skin.
export function TextLink({ href, onClick, children }: { href?: string; onClick?: () => void; children: React.ReactNode }) {
  return href
    ? <a className="chart-link" href={href}>{children}<ArrowRight size={16} /></a>
    : <button type="button" className="chart-link" onClick={onClick}>{children}<ArrowRight size={16} /></button>
}