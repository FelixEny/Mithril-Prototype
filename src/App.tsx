import { lazy, Suspense, useEffect, useState } from 'react'
import { Sidebar, PageKey } from './components/Sidebar'
import { PageSkeleton, BenchSkeleton } from './components/PageSkeleton'
import { loadData } from './data'
import { RangeDays } from './analytics'
import { DEFAULT_RANGE } from './ranges'
import { ToastProvider } from './toast'
import { Toaster } from './components/Toaster'
import type { ReactNode } from 'react'
import type { RangeProps } from './pages/EngagementPage'

// Pages are code-split so Recharts (Overview/Engagement/People),
// react-day-picker (Engagement/Relationships) and sigma/graphology
// (Relationships) never load into the app shell. The shell keeps React, the
// phosphor icons, the data/analytics engines and the shared chrome. A page's
// engine work then only happens once that page is actually opened.
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })))
const EngagementPage = lazy(() => import('./pages/EngagementPage').then((m) => ({ default: m.EngagementPage })))
const RelationshipsPage = lazy(() => import('./pages/RelationshipsPage').then((m) => ({ default: m.RelationshipsPage })))
const PeoplePage = lazy(() => import('./pages/PeoplePage').then((m) => ({ default: m.PeoplePage })))

// #/bench stays out of the main bundle: it only ever loads on that dev-only
// route, so it is code-split into its own chunk.
const BenchmarkPage = lazy(() => import('./pages/BenchmarkPage'))

// Minimal hash routing: the app's default page is Overview, but a fragment
// (#/engagement, #/relationships, #/people, ...) selects the initial page so
// individual pages can be smoke-tested headlessly and deep-linked. #/bench (and
// #/bench/all) mounts the performance bench page directly, outside the sidebar
// layout.
const hashPage = (): PageKey => {
  const h = window.location.hash.replace(/^#\/?/, '').toLowerCase()
  if (h === 'relationships') return 'Relationships'
  if (h === 'people') return 'People'
  if (h === 'overview') return 'Overview'
  if (h === 'engagement') return 'Engagement'
  return 'Overview'
}

const isBench = () => window.location.hash.startsWith('#/bench')

// A page panel is only mounted once its page has been visited (or is the
// active page); afterwards it stays mounted, hidden, so the page keeps its
// state across navigation. Deferred pages never mount, fetch chunks, or run
// their engines just because they exist in the nav. `page` picks the skeleton
// that mirrors the page this panel hosts while its chunk loads.
function PagePanel({ page, active, show, children }: { page: PageKey; active: boolean; show: boolean; children: ReactNode }) {
  if (!show) return null
  return (
    <section className="page-panel" hidden={!active}>
      <Suspense fallback={<PageSkeleton page={page} />}>{children}</Suspense>
    </section>
  )
}

export default function App() {
  const [bench, setBench] = useState(isBench)
  const [page, setPage] = useState<PageKey>(hashPage)
  const [range, setRange] = useState<RangeDays>(DEFAULT_RANGE)
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null)
  const [focusMember, setFocusMember] = useState<string | null>(null)
  const [focusSegment, setFocusSegment] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [visited, setVisited] = useState<Set<PageKey>>(() => new Set([hashPage()]))
  const navigate = (p: PageKey) => {
    setPage(p)
    window.history.replaceState(null, '', `#/${p.toLowerCase()}`)
  }
  const exploreMember = (memberId: string) => {
    setFocusMember(memberId)
    navigate('Relationships')
  }
  const openSegmentInPeople = (segmentId: string) => {
    setFocusSegment(segmentId)
    navigate('People')
  }
  useEffect(() => {
    const onHash = () => {
      setBench(isBench())
      if (!isBench()) setPage(hashPage())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  // Initials and pending-photo markers bake into the graph avatar atlas
  // synchronously, and the DOM
  // Avatar centres its glyph from font metrics — both need the real Geist
  // outlines, not a fallback. Since every render is gated on `ready` anyway,
  // waiting here costs nothing visible and beats baking Arial and popping.
  useEffect(() => {
    let cancelled = false
    loadData()
      .then(() => document.fonts.load('600 36px Geist'))
      .catch(() => {})
      .then(() => document.fonts.ready)
      .catch(() => {})
      .then(() => { if (!cancelled) setReady(true) })
    return () => { cancelled = true }
  }, [])
  // Remember every visited page so its panel stays mounted (and stateful)
  // once opened. The active page renders regardless — `visited` is only
  // consulted for pages that are currently hidden.
  useEffect(() => {
    setVisited(v => (v.has(page) ? v : new Set(v).add(page)))
  }, [page])
  // Sticky-collapsible page headers (Engagement/Relationships/People) pin and
  // compact in lockstep once the window scrolls past main's top padding. The
  // class lives on <body> so it survives page switches (scroll position is
  // preserved) and only touches headers that opt in via `collapsible`.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y > 64) document.body.classList.add('header-compact')
      else if (y < 24) document.body.classList.remove('header-compact')
      document.body.classList.toggle('is-scrolled', y > 0)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const rangeProps: RangeProps = { range, custom, onSelectPreset: (d) => { setRange(d); setCustom(null) }, onSelectRange: (from, to) => setCustom({ from, to }) }
  if (bench || isBench()) {
    return <ToastProvider><Suspense fallback={<BenchSkeleton />}><BenchmarkPage /></Suspense><Toaster /></ToastProvider>
  }
  const app: ReactNode = !ready
    ? <div className="app"><Sidebar active={page} onNavigate={navigate} /><main aria-busy="true"><PageSkeleton page={page} /></main></div>
    : <div className="app"><Sidebar active={page} onNavigate={navigate} /><main>
        <PagePanel page="Overview" active={page === 'Overview'} show={visited.has('Overview') || page === 'Overview'}><OverviewPage onNavigate={navigate} /></PagePanel>
        <PagePanel page="Engagement" active={page === 'Engagement'} show={visited.has('Engagement') || page === 'Engagement'}><EngagementPage {...rangeProps} onOpenSegmentInPeople={openSegmentInPeople} /></PagePanel>
        <PagePanel page="Relationships" active={page === 'Relationships'} show={visited.has('Relationships') || page === 'Relationships'}><RelationshipsPage {...rangeProps} active={page === 'Relationships'} focusMemberId={focusMember} onFocusConsumed={() => setFocusMember(null)} /></PagePanel>
        <PagePanel page="People" active={page === 'People'} show={visited.has('People') || page === 'People'}><PeoplePage {...rangeProps} focusSegmentId={focusSegment} onFocusSegmentConsumed={() => setFocusSegment(null)} onExploreMember={exploreMember} /></PagePanel>
      </main></div>
  return <ToastProvider>{app}<Toaster /></ToastProvider>
}