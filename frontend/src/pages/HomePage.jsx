import { useMemo, useState } from 'react'
import { MOCK_STRESS_ZONES, REPORT_TYPES } from '../constants'
import { reportAllowedByPreferences } from '../utils/geo'
import SenseMap from '../components/map/SenseMap'

function buildAlerts(stressZones) {
  const high = stressZones.filter((z) => z.level === 'high')
  const pick = high[Math.floor(Math.random() * high.length)] || stressZones[0]
  const pred = stressZones[Math.floor(Math.random() * stressZones.length)]
  const hour = new Date()
  hour.setMinutes(0, 0, 0)
  hour.setHours(hour.getHours() + 1)
  const peakLabel = hour.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return [
    {
      kind: 'realtime',
      title: `${pick.name} — high pedestrian stress (simulated)`,
      body: 'Demonstration alert only. A real version requires current pedestrian data.',
      meta: 'Simulated · updated just now',
      lat: pick.lat,
      lng: pick.lng,
    },
    {
      kind: 'predictive',
      title: `${pred.name} — medium pedestrian stress (simulated)`,
      body: `Demonstration scenario for the next hour (around ${peakLabel}).`,
      meta: 'Simulated prototype · not a model prediction',
      lat: pred.lat,
      lng: pred.lng,
    },
  ]
}

/**
 * Homepage: community map + alerts + filters + recent reports.
 */
export default function HomePage({ reports, preferences, onNavigate }) {
  const [filters, setFilters] = useState({
    crowds: true,
    loud: true,
    roadworks: true,
    heavy: true,
    other: true,
  })
  const [showStress, setShowStress] = useState(true)
  const [flyTo, setFlyTo] = useState(null)

  const alerts = useMemo(() => buildAlerts(MOCK_STRESS_ZONES), [])

  const visibleReports = useMemo(
    () =>
      reports
        .filter((r) => filters[r.type] && reportAllowedByPreferences(r.type, preferences))
        .slice()
        .sort((a, b) => a.minsAgo - b.minsAgo),
    [reports, filters, preferences],
  )

  return (
    <div className="page active" id="home">
      <p className="page-desc">
        Community sensory map for Melbourne CBD — alerts, filtered reports, and nearby context.
      </p>
      <div className="content-grid">
        <div className="map-column">
          <div className="above-map">
            <div className="card-sm alert-card">
              <h3>Alerts</h3>
              <div>
                {alerts.map((alert) => (
                  <div
                    className="alert-item"
                    key={alert.title}
                    onClick={() => setFlyTo({ lat: alert.lat, lng: alert.lng, zoom: 16 })}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={`alert-badge ${alert.kind}`}>
                      {alert.kind === 'realtime' ? 'Live' : 'Predicted'}
                    </span>
                    <h4>{alert.title}</h4>
                    <p>{alert.body}</p>
                    <p className="meta">{alert.meta}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SenseMap
            reports={reports}
            filters={filters}
            preferencesFilter={(type) => reportAllowedByPreferences(type, preferences)}
            showStress={showStress}
            stressZones={MOCK_STRESS_ZONES}
            showRefuges={false}
            refuges={[]}
            flyTo={flyTo}
          >
            <div className="map-legend">
              <div className="map-legend-row"><span className="legend-dot">C</span> Crowds</div>
              <div className="map-legend-row"><span className="legend-dot">L</span> Loud events</div>
              <div className="map-legend-row"><span className="legend-dot">R</span> Roadworks</div>
              <div className="map-legend-row"><span className="legend-dot">H</span> Heavy crowds</div>
              <div className="map-legend-row"><span className="legend-dot stress-high" /> High pedestrian stress (simulated demo)</div>
              <div className="map-legend-row"><span className="legend-dot stress-med" /> Medium pedestrian stress (simulated demo)</div>
            </div>
          </SenseMap>
        </div>

        <div className="sidebar-stack">
          <div className="card-sm recent-card">
            <h3>Recent reports</h3>
            <div className="recent-list">
              {!visibleReports.length ? (
                <div className="recent-empty">
                  <h4>No active reports</h4>
                  <p>Community reports will appear here.</p>
                  <p className="meta">Expired reports are hidden automatically.</p>
                </div>
              ) : (
                visibleReports.map((report) => (
                  <div
                    className="recent-item"
                    key={report.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setFlyTo({ lat: report.lat, lng: report.lng, zoom: 17 })}
                  >
                    <h4>{report.title}</h4>
                    <p>{report.street}</p>
                    <p>Reported {report.minsAgo} min ago</p>
                    <p className="meta">
                      {report.street} · {report.minsAgo} min ago · {REPORT_TYPES[report.type]?.label}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <button className="btn-primary btn-full report-action" type="button" onClick={() => onNavigate('report1')}>
            + Report sensory issue
          </button>

          <div className="card-sm filter-card">
            <h3>Filter reports</h3>
            {Object.entries(REPORT_TYPES).map(([key, value]) => (
              <label className="checkbox-item" key={key}>
                <input
                  type="checkbox"
                  checked={filters[key]}
                  onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })}
                />
                <strong>{value.letter}</strong>&nbsp; {value.label}
              </label>
            ))}
            <label className="checkbox-item" style={{ marginTop: 8 }}>
              <input
                type="checkbox"
                checked={showStress}
                onChange={(e) => setShowStress(e.target.checked)}
              />
              Show simulated pedestrian stress zones
            </label>
            <p className="filter-hint">Prototype demonstration data only</p>
          </div>
        </div>
      </div>
    </div>
  )
}
