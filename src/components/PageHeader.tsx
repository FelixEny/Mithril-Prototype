import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <header>
    <div className="page-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {action}
  </header>
}