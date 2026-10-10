import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action, titleClassName, headerClassName, collapsible }: { title: ReactNode; subtitle?: string; action?: ReactNode; titleClassName?: string; headerClassName?: string; collapsible?: boolean }) {
  const cls = [headerClassName, collapsible && 'sticky-compact'].filter(Boolean).join(' ') || undefined
  return <header className={cls}>
    <div className={titleClassName ? `page-title ${titleClassName}` : 'page-title'}><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {action}
  </header>
}