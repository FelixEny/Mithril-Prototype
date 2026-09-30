import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CheckCircle, WarningCircle, X, XCircle } from '@phosphor-icons/react'
import { useToast, type Toast } from '../toast'

const ICONS = { success: CheckCircle, error: XCircle, warning: WarningCircle } as const

function ToastItem({ toast }: { toast: Toast }) {
  const { dismiss } = useToast()
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<number | null>(null)
  const endRef = useRef(0)
  const remainingRef = useRef(toast.duration)

  useEffect(() => {
    if (paused) {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
      remainingRef.current = Math.max(0, endRef.current - Date.now())
      return
    }
    endRef.current = Date.now() + remainingRef.current
    timerRef.current = window.setTimeout(() => dismiss(toast.id), remainingRef.current)
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [paused, toast.id, dismiss])

  const Icon = ICONS[toast.kind]
  return (
    <div
      className={`toast ${toast.kind}`}
      role="status"
      style={{ '--duration': `${toast.duration}ms` } as CSSProperties}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-icon"><Icon size={16} weight="fill" /></span>
      <div className="toast-body">
        <div className="toast-title">{toast.title}</div>
        {toast.message && <div className="toast-message">{toast.message}</div>}
      </div>
      <div className="toast-side">
        {toast.action && (
          <button type="button" className="toast-action" onClick={() => { dismiss(toast.id); toast.action!.onClick() }}>
            {toast.action.label}
          </button>
        )}
        <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
          <X size={14} />
        </button>
      </div>
      <span className="toast-progress" aria-hidden="true" />
    </div>
  )
}

export function Toaster() {
  const { toasts } = useToast()
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="false">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  )
}