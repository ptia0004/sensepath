import { useState } from 'react'
import Nav from './components/Nav'
import MapPage from './pages/MapPage'
import ReportStep1 from './pages/ReportStep1'
import ReportStep2 from './pages/ReportStep2'
import PublishedPage from './pages/PublishedPage'
import { useAppData } from './hooks/useAppData'
import { usePreferences } from './hooks/usePreferences'
import './styles/app.css'

/**
 * App root: owns page navigation and shared data.
 * Pages: map | report1 | report2 | published
 */
export default function App() {
  const [page, setPage] = useState('map')
  const [category, setCategory] = useState('crowds')
  const [publishedReport, setPublishedReport] = useState(null)

  const { reports, refuges, modelStatus, loadReports } = useAppData()
  const { preferences, setPreferences, status: preferencesStatus, save } = usePreferences()

  return (
    <>
      <Nav page={page} onNavigate={setPage} />

      {page === 'map' && (
        <MapPage
          reports={reports}
          refuges={refuges}
          preferences={preferences}
          setPreferences={setPreferences}
          preferencesStatus={preferencesStatus}
          savePreferences={save}
          modelStatus={modelStatus}
          onNavigate={setPage}
        />
      )}

      {page === 'report1' && (
        <ReportStep1
          category={category}
          setCategory={setCategory}
          onNext={() => setPage('report2')}
          onBack={() => setPage('map')}
        />
      )}

      {page === 'report2' && (
        <ReportStep2
          category={category}
          onBack={() => setPage('report1')}
          reloadReports={loadReports}
          onSubmitted={(report) => {
            setPublishedReport(report)
            setPage('published')
          }}
        />
      )}

      {page === 'published' && (
        <PublishedPage report={publishedReport} onBackToMap={() => setPage('map')} />
      )}
    </>
  )
}
