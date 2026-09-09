export function CardTitle({ title, action, className = '' }: { title: string; action?: React.ReactNode; className?: string }) {
  return <div className={`card-title${action ? '' : ' card-title-no-action'}${className ? ' ' + className : ''}`}><h3>{title}</h3>{action && <div className="card-title-action">{action}</div>}</div>
}