import { lazy, Suspense, useEffect, useState } from 'react'
import { Sidebar, PageKey } from './components/Sidebar'
import { PageHeader } from './components/PageHeader'
import DashboardSkeleton from './components/DashboardSkeleton'
import { Card } from './components/Card'
import { EngagementPage, RangeProps } from './pages/EngagementPage'
import { OverviewPage } from './pages/OverviewPage'
import { RelationshipsPage } from './pages/RelationshipsPage'
import { PeoplePage } from './pages/PeoplePage'
import { loadData } from './data'
import { RangeDays } from './analytics'
import { ToastProvider } from './toast'
import { Toaster } from './components/Toaster'
import type { ReactNode } from 'react'

// #/bench stays out of the main bundle: it only ever loads on that dev-only
// route, so it is code-split into its own chunk.
const BenchmarkPage = lazy(() => import('./pages/BenchmarkPage'))

const subtitles: Record<PageKey, string> = {
  Overview: 'Understand the overall health of your community',
  Engagement: 'Understand how members participate in your community',
  Relationships: 'Understand how members connect, influence and bridge your community',
  People: 'Find and understand members of your community',
}

// Minimal hash routing: the app's default page is Engagement, but a fragment
// (#/relationships, #/people, ...) selects the initial page so the graph can be
// smoke-tested headlessly and deep-linked. #/bench (and #/bench/all) mounts the
// performance bench page directly, outside the sidebar layout.
const hashPage = (): PageKey => {
  const h = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  if (h === 'relationships') return 'Relationships'
  if (h === 'people') return 'People'
  if (h === 'overview') return 'Overview'
  return 'Engagement'
}

const isBench = () => window.location.hash.startsWith('#/bench')

export default function App() {
  const [bench, setBench] = useState(isBench)
  const [page, setPage] = useState<PageKey>(hashPage)
  const [range, setRange] = useState<RangeDays>(30)
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null)
  const [ready, setReady] = useState(false)
  const [warm, setWarm] = useState(false)
  const navigate = (p: PageKey) => {
    setPage(p)
    window.history.replaceState(null, '', `#/${p.toLowerCase()}`)
  }
  useEffect(() => {
    const onHash = () => {
      setBench(isBench())
      if (!isBench()) setPage(hashPage())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Initials bake into the graph avatar atlas synchronously, and the DOM
  // Avatar centres its glyph from font metrics — both need the real Geist
  // outlines, not a fallback. Since every render is gated on `ready` anyway,
  // waiting here costs nothing visible and beats baking Arial and popping.
  useEffect(() => {
    let cancelled = false
    loadData()
      .then(() => document.fonts.load('600 40px Geist'))
      .catch(() => {})
      .then(() => document.fonts.ready)
      .catch(() => {})
      .then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])
  // Deferred warm: after the skeleton clears, mount the inactive pages hidden so
  // their analytics engines (relationships, influence, people rows) are computed
  // and their DOM is ready before the user navigates. Yields past first paint.
  useEffect(() => {
    if (!ready) return
    let raf1 = 0, raf2 = 0
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setWarm(true)) })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [ready])
  const rangeProps: RangeProps = { range, custom, onSelectPreset: (d) => { setRange(d); setCustom(null) }, onSelectRange: (from, to) => setCustom({ from, to }) }
  const hidden = (p: PageKey) => page !== p
  if (bench || isBench()) {
    return <ToastProvider><Suspense fallback={<div className="app"><main aria-busy="true"><DashboardSkeleton /></main></div>}><BenchmarkPage /></Suspense><Toaster /></ToastProvider>
  }
  const app: ReactNode = !ready
    ? <div className="app"><Sidebar active={page} onNavigate={navigate} /><main aria-busy="true"><PageHeader title={page} subtitle={subtitles[page]} /><DashboardSkeleton /></main></div>
    : <div className="app"><Sidebar active={page} onNavigate={navigate} /><main>
        <section className="page-panel" hidden={hidden('Overview')}><OverviewPage {...rangeProps} /></section>
        <section className="page-panel" hidden={hidden('Engagement')}><EngagementPage {...rangeProps} /></section>
        {(warm || page === 'Relationships') && <section className="page-panel" hidden={hidden('Relationships')}><RelationshipsPage {...rangeProps} active={page === 'Relationships'} /></section>}
        {(warm || page === 'People') && <section className="page-panel" hidden={hidden('People')}><PeoplePage {...rangeProps} /></section>}
      </main></div>
  return <ToastProvider>{app}<Toaster /></ToastProvider>
}
