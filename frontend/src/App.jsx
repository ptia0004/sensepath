import { useState } from 'react'
import Nav from './components/Nav'
import SiteFooter from './components/SiteFooter'
import LoadingPage from './components/LoadingPage'
import HomePage from './pages/HomePage'
import RoutesPage from './pages/RoutesPage'
import AiPage from './pages/AiPage'
import ReportStep1 from './pages/ReportStep1'
import ReportStep2 from './pages/ReportStep2'
import PublishedPage from './pages/PublishedPage'
import { useAppData } from './hooks/useAppData'
import { usePreferences } from './hooks/usePreferences'
import './styles/app.css'

/**
 * App root: owns page navigation and shared data.
 * Pages: home | routes | ai | report1 | report2 | published
 */
export default function App() {
  const [page, setPage] = useState('home')
  const [category, setCategory] = useState('crowds')
  const [publishedReport, setPublishedReport] = useState(null)

  const { reports, refuges, modelStatus, loadReports, booting, bootMessage } = useAppData()
  const { preferences, setPreferences, status: preferencesStatus, save } = usePreferences()

  if (booting) {
    return <LoadingPage message={bootMessage} />
  }

  return (
    <div className="app-shell">
      <Nav page={page} onNavigate={setPage} />

      <main className="app-main">
        {page === 'home' && (
          <HomePage reports={reports} /*preferences={preferences}*/ onNavigate={setPage} />
        )}

        {page === 'routes' && (
          <RoutesPage
            reports={reports}
            refuges={refuges}
            preferences={preferences}
            setPreferences={setPreferences}
            preferencesStatus={preferencesStatus}
            savePreferences={save}
          />
        )}

        {page === 'ai' && <AiPage modelStatus={modelStatus} />}

        {page === 'report1' && (
          <ReportStep1
            category={category}
            setCategory={setCategory}
            onNext={() => setPage('report2')}
            onBack={() => setPage('home')}
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
          <PublishedPage report={publishedReport} onBackToMap={() => setPage('home')} />
        )}
      </main>

      <SiteFooter />
    </div>
  )
}
