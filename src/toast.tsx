import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

export type ToastKind = 'success' | 'error' | 'warning'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  message?: string
  action?: { label: string; onClick: () => void }
  duration: number
}

export type ToastInput = Omit<Toast, 'id' | 'duration'> & { duration?: number }

interface ToastCtx {
  toasts: Toast[]
  push: (input: ToastInput) => number
  dismiss: (id: number) => void
}

const DEFAULT_DURATION = 4500
const MAX_VISIBLE = 3

const Ctx = createContext<ToastCtx | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((input: ToastInput) => {
    const id = idRef.current++
    setToasts((prev) => {
      const next = [...prev, { ...input, id, duration: input.duration ?? DEFAULT_DURATION }]
      return next.length <= MAX_VISIBLE ? next : next.slice(next.length - MAX_VISIBLE)
    })
    return id
  }, [])

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}