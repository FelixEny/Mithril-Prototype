import { useEffect, useState } from 'react'
import { Sidebar, PageKey } from './components/Sidebar'
import { PageHeader } from './components/PageHeader'
import DashboardSkeleton from './components/DashboardSkeleton'
import { Card } from './components/Card'
import { EngagementPage, RangeProps } from './pages/EngagementPage'
import { RelationshipsPage } from './pages/RelationshipsPage'
import { loadData } from './data'
import { RangeDays } from './analytics'

const subtitles: Record<PageKey, string> = {
  Overview: 'Understand the overall health of your community',
  Engagement: 'Understand how members participate in your community',
  Relationships: 'Understand how members connect, influence and bridge your community',
  People: 'Understand the members of your community',
}

function Placeholder({ page }: { page: PageKey }) {
  return <><PageHeader title={page} subtitle={subtitles[page]} /><Card><p>This view is not part of the prototype yet.</p></Card></>
}

export default function App() {
  const [page, setPage] = useState<PageKey>('Engagement')
  const [range, setRange] = useState<RangeDays>(30)
  const [custom, setCustom] = useState<{ from: Date; to: Date } | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => { loadData().then(() => setReady(true)) }, [])
  const rangeProps: RangeProps = { range, custom, onSelectPreset: (d) => { setRange(d); setCustom(null) }, onSelectRange: (from, to) => setCustom({ from, to }) }
  if (!ready) return <div className="app"><Sidebar active={page} onNavigate={setPage} /><main aria-busy="true"><PageHeader title={page} subtitle={subtitles[page]} /><DashboardSkeleton /></main></div>
  return <div className="app"><Sidebar active={page} onNavigate={setPage} /><main>{page === 'Engagement' ? <EngagementPage {...rangeProps} /> : page === 'Relationships' ? <RelationshipsPage {...rangeProps} /> : <Placeholder page={page} />}</main></div>
}
