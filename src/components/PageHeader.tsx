import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action, titleClassName, headerClassName }: { title: ReactNode; subtitle?: string; action?: ReactNode; titleClassName?: string; headerClassName?: string }) {
  return <header className={headerClassName}>
    <div className={titleClassName ? `page-title ${titleClassName}` : 'page-title'}><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {action}
  </header>
}