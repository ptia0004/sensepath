import { useMemo, useState } from 'react'
import {
  ASSET_TYPES,
  MOCK_STRESS_ZONES,
  REPORT_TYPES,
  ROUTE_STYLES,
  CBD,
} from '../constants'
import { apiFetch, apiErrorMessage } from '../api/client'
import { reportAllowedByPreferences, roundCoord, scoreRoute, uniqueRoutes, nameRankedRoutes } from '../utils/geo'
import { buildWalkingRoutePlans } from '../utils/routing'
import { typeLabel } from '../utils/markers'
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

export default function MapPage({
  reports,
  refuges,
  preferences,
  setPreferences,
  preferencesStatus,
  savePreferences,
  modelStatus,
  onNavigate,
}) {
  const [filters, setFilters] = useState({
    crowds: true,
    loud: true,
    roadworks: true,
    heavy: true,
    other: true,
  })
  const [showStress, setShowStress] = useState(true)
  const [showRefuges, setShowRefuges] = useState(false)
  const [flyTo, setFlyTo] = useState(null)

  const [assetType, setAssetType] = useState('Seat')
  const [modelLat, setModelLat] = useState(CBD.lat)
  const [modelLng, setModelLng] = useState(CBD.lng)
  const [modelResult, setModelResult] = useState('Select an asset and run the deployed model.')
  const [modelLevel, setModelLevel] = useState('')
  const [predicting, setPredicting] = useState(false)

  const [routeStart, setRouteStart] = useState({ lat: CBD.lat, lng: CBD.lng })
  const [routeEnd, setRouteEnd] = useState({ lat: -37.8183, lng: 144.9671 })
  const [pickMode, setPickMode] = useState(null)
  const [routeStatus, setRouteStatus] = useState(
    'Use the buttons to pick points on the map. Drag S/D markers to adjust, then Compare.',
  )
  const [routeResults, setRouteResults] = useState([])
  const [routeNote, setRouteNote] = useState('')
  const [comparing, setComparing] = useState(false)

  const alerts = useMemo(() => buildAlerts(MOCK_STRESS_ZONES), [])

  const visibleReports = useMemo(
    () =>
      reports
        .filter((r) => filters[r.type] && reportAllowedByPreferences(r.type, preferences))
        .slice()
        .sort((a, b) => a.minsAgo - b.minsAgo),
    [reports, filters, preferences],
  )

  const pickMarkers = [
    {
      id: 'ai',
      lat: modelLat,
      lng: modelLng,
      letter: 'A',
      popup: `AI prediction location<br>${roundCoord(modelLat).toFixed(4)}, ${roundCoord(modelLng).toFixed(4)}`,
      onDragEnd: (lat, lng) => {
        setModelLat(roundCoord(lat))
        setModelLng(roundCoord(lng))
      },
    },
    {
      id: 'start',
      lat: routeStart.lat,
      lng: routeStart.lng,
      letter: 'S',
      popup: `Route start<br>${roundCoord(routeStart.lat).toFixed(4)}, ${roundCoord(routeStart.lng).toFixed(4)}`,
      onDragEnd: (lat, lng) => setRouteStart({ lat: roundCoord(lat), lng: roundCoord(lng) }),
    },
    {
      id: 'end',
      lat: routeEnd.lat,
      lng: routeEnd.lng,
      letter: 'D',
      popup: `Route destination<br>${roundCoord(routeEnd.lat).toFixed(4)}, ${roundCoord(routeEnd.lng).toFixed(4)}`,
      onDragEnd: (lat, lng) => setRouteEnd({ lat: roundCoord(lat), lng: roundCoord(lng) }),
    },
  ]

  function handleMapClick(lat, lng) {
    const rounded = { lat: roundCoord(lat), lng: roundCoord(lng) }
    if (pickMode === 'route-start') {
      setRouteStart(rounded)
      setPickMode('route-end')
      setRouteStatus('Click the community map to set the destination.')
      return
    }
    if (pickMode === 'route-end') {
      setRouteEnd(rounded)
      setPickMode(null)
      setRouteStatus('Start and destination ready. Click Compare, or pick again on the map.')
      return
    }
    setModelLat(rounded.lat)
    setModelLng(rounded.lng)
  }

  async function runPrediction() {
    setPredicting(true)
    setModelLevel('')
    setModelResult('Running model...')
    try {
      const response = await apiFetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asset_class: 'Outdoor Furniture',
          asset_type: assetType,
          latitude: Number(modelLat),
          longitude: Number(modelLng),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Prediction failed')
      setModelLevel(body.sensory_risk_level)
      setModelResult(
        `Condition: ${body.condition_label} (${body.condition_score}/5) · Assistive risk: ${body.sensory_risk_level} (${body.sensory_risk_score}/100) · ${body.latency_ms} ms`,
      )
    } catch (error) {
      setModelResult(apiErrorMessage(error))
    } finally {
      setPredicting(false)
    }
  }

  async function compareRoutes() {
    setComparing(true)
    setRouteNote('Planning walking routes along the street network...')
    setRouteResults([])
    try {
      const plan = await buildWalkingRoutePlans(routeStart, routeEnd)
      const ranked = plan.paths
        .map((path) =>
          scoreRoute(
            path.name,
            path.points,
            plan.directDistance,
            reports,
            refuges,
            preferences,
          ),
        )
        .sort((a, b) => a.score - b.score || a.distance - b.distance)
      const named = nameRankedRoutes(uniqueRoutes(ranked))
      setRouteResults(named)
      setRouteNote(
        plan.source === 'street-network'
          ? 'Routes follow the OpenStreetMap walking network. Near-identical alternatives are hidden.'
          : 'Street router unavailable — showing simplified street-like paths. Near-identical alternatives are hidden.',
      )
    } catch (error) {
      setRouteNote(`Could not plan routes: ${error.message}`)
    } finally {
      setComparing(false)
    }
  }

  return (
    <div className="page active" id="map">
      <p className="page-desc">
        Prototype sensory map with simulated stress zones, community-report examples, real open-data
        refuges, and a deployed facility-condition model.
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

            <div className="card-sm refuge-card">
              <h3>Sensory refuges</h3>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={showRefuges}
                  onChange={(e) => setShowRefuges(e.target.checked)}
                />
                Show nearby parks, libraries &amp; quiet spaces
              </label>
              <div className={`refuge-list ${showRefuges ? 'visible' : ''}`}>
                {refuges.map((refuge) => (
                  <div
                    className="refuge-item"
                    key={refuge.id}
                    onClick={() => setFlyTo({ lat: refuge.lat, lng: refuge.lng, zoom: 17 })}
                  >
                    <h4>{refuge.name}</h4>
                    <p>
                      {typeLabel(refuge.type)} · ~{refuge.distanceM} m
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <SenseMap
            onClick={handleMapClick}
            reports={reports}
            filters={filters}
            preferencesFilter={(type) => reportAllowedByPreferences(type, preferences)}
            showStress={showStress}
            stressZones={MOCK_STRESS_ZONES}
            showRefuges={showRefuges}
            refuges={refuges}
            routes={routeResults}
            routeStyles={ROUTE_STYLES}
            pickMarkers={pickMarkers}
            flyTo={flyTo}
          >
            <div className="map-legend">
              <div className="map-legend-row"><span className="legend-dot">C</span> Crowds</div>
              <div className="map-legend-row"><span className="legend-dot">L</span> Loud events</div>
              <div className="map-legend-row"><span className="legend-dot">R</span> Roadworks</div>
              <div className="map-legend-row"><span className="legend-dot">H</span> Heavy crowds</div>
              <div className="map-legend-row"><span className="legend-dot refuge">P</span> Park refuge</div>
              <div className="map-legend-row"><span className="legend-dot refuge">L</span> Library refuge</div>
              <div className="map-legend-row"><span className="legend-dot refuge">Q</span> Quiet refuge</div>
              <div className="map-legend-row"><span className="legend-dot stress-high" /> High pedestrian stress (simulated demo)</div>
              <div className="map-legend-row"><span className="legend-dot stress-med" /> Medium pedestrian stress (simulated demo)</div>
            </div>
          </SenseMap>

          <div className="below-map">
            <div className="card-sm model-card route-card">
              <h3>Quiet route comparison</h3>
              <p className="model-note">
                Pick start and destination on the map, then compare three walking routes planned along
                the street network. Sensory scoring is assistive guidance, not turn-by-turn navigation.
              </p>
              <div className="route-pick-row">
                <button
                  type="button"
                  className={`btn-pick ${pickMode === 'route-start' ? 'active' : ''}`}
                  onClick={() => {
                    const next = pickMode === 'route-start' ? null : 'route-start'
                    setPickMode(next)
                    setRouteStatus(
                      next === 'route-start'
                        ? 'Click the community map to set the start point.'
                        : 'Use the buttons to pick points on the map. Drag S/D markers to adjust, then Compare.',
                    )
                  }}
                >
                  1. Set start on map
                </button>
                <button
                  type="button"
                  className={`btn-pick ${pickMode === 'route-end' ? 'active' : ''}`}
                  onClick={() => {
                    const next = pickMode === 'route-end' ? null : 'route-end'
                    setPickMode(next)
                    setRouteStatus(
                      next === 'route-end'
                        ? 'Click the community map to set the destination.'
                        : 'Use the buttons to pick points on the map. Drag S/D markers to adjust, then Compare.',
                    )
                  }}
                >
                  2. Set destination on map
                </button>
              </div>
              <p className="model-status" role="status">{routeStatus}</p>
              <div className="route-coord-summary">
                <div>
                  <strong>Start</strong>
                  <span>
                    {routeStart.lat}, {routeStart.lng}
                  </span>
                </div>
                <div>
                  <strong>Destination</strong>
                  <span>
                    {routeEnd.lat}, {routeEnd.lng}
                  </span>
                </div>
              </div>
              <details>
                <summary>Fine-tune coordinates</summary>
                <div className="route-fields">
                  <div className="model-field">
                    <label>Start latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={routeStart.lat}
                      onChange={(e) => setRouteStart({ ...routeStart, lat: Number(e.target.value) })}
                    />
                  </div>
                  <div className="model-field">
                    <label>Start longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={routeStart.lng}
                      onChange={(e) => setRouteStart({ ...routeStart, lng: Number(e.target.value) })}
                    />
                  </div>
                  <div className="model-field">
                    <label>Destination latitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={routeEnd.lat}
                      onChange={(e) => setRouteEnd({ ...routeEnd, lat: Number(e.target.value) })}
                    />
                  </div>
                  <div className="model-field">
                    <label>Destination longitude</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={routeEnd.lng}
                      onChange={(e) => setRouteEnd({ ...routeEnd, lng: Number(e.target.value) })}
                    />
                  </div>
                </div>
              </details>
              <button type="button" className="btn-primary btn-full" disabled={comparing} onClick={compareRoutes}>
                Compare route corridors
              </button>
              <div className="route-line-legend" aria-label="Map corridor line legend">
                {ROUTE_STYLES.slice(0, Math.max(routeResults.length, 1)).map((style, index) => (
                  <div className="route-legend-item" key={style.className} style={{ display: index < Math.max(routeResults.length, 1) ? 'flex' : 'none' }}>
                    <span className={`route-line-swatch ${style.className}`} aria-hidden="true" />
                    <span>
                      <strong>{style.label}</strong>
                      {' — '}
                      {index === 0 ? 'Recommended route' : `Route ${index}`}
                    </span>
                  </div>
                ))}
              </div>
              <div role="status" aria-live="polite">
                {routeNote ? <p className="model-status" style={{ margin: '0 0 8px' }}>{routeNote}</p> : null}
                {routeResults.map((route, index) => {
                  const style = ROUTE_STYLES[index]
                  return (
                    <div className={`route-result ${index === 0 ? 'best' : ''}`} key={route.name}>
                      <div className="route-result-head">
                        <span className={`route-line-swatch ${style.className}`} aria-hidden="true" />
                        <h4>{route.name}</h4>
                      </div>
                      <p>
                        {style.label} on map · Assistive score {route.score}/100 (lower is calmer) ·{' '}
                        {route.distance} m · {route.reports} active reports · {route.refuges} nearby
                        refuges
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="card-sm model-card preferences-card">
              <h3>Sensory preferences</h3>
              <p className="model-note">
                Saved on this device and applied immediately to report visibility and route scoring.
              </p>
              <div className="model-field">
                <label htmlFor="crowd-tolerance">Crowd tolerance</label>
                <select
                  id="crowd-tolerance"
                  value={preferences.crowdTolerance}
                  onChange={(e) => setPreferences({ ...preferences, crowdTolerance: e.target.value })}
                >
                  <option value="low">Low — show crowd alerts</option>
                  <option value="medium">Medium — show heavy crowds</option>
                  <option value="high">High — hide crowd alerts</option>
                </select>
              </div>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={preferences.avoidLoud}
                  onChange={(e) => setPreferences({ ...preferences, avoidLoud: e.target.checked })}
                />
                Alert me about loud events
              </label>
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={preferences.avoidRoadworks}
                  onChange={(e) => setPreferences({ ...preferences, avoidRoadworks: e.target.checked })}
                />
                Alert me about roadworks
              </label>
              <button type="button" className="btn-primary btn-full" onClick={savePreferences}>
                Save preferences
              </button>
              <p className="model-status" role="status">{preferencesStatus}</p>
            </div>
          </div>
        </div>

        <div className="sidebar-stack">
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

          <div className="card-sm model-card ai-card">
            <h3>AI facility condition</h3>
            <p className="model-note">
              Estimates street-furniture condition from asset type and location. Click the map to fill
              coordinates (when not picking a route). It is not a live crowd or noise prediction.
            </p>
            <div className="model-field">
              <label htmlFor="model-asset-type">Asset type</label>
              <select id="model-asset-type" value={assetType} onChange={(e) => setAssetType(e.target.value)}>
                {ASSET_TYPES.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </div>
            <div className="model-field">
              <label htmlFor="model-latitude">Latitude</label>
              <input
                id="model-latitude"
                type="number"
                step="0.0001"
                value={modelLat}
                onChange={(e) => setModelLat(Number(e.target.value))}
              />
            </div>
            <div className="model-field">
              <label htmlFor="model-longitude">Longitude</label>
              <input
                id="model-longitude"
                type="number"
                step="0.0001"
                value={modelLng}
                onChange={(e) => setModelLng(Number(e.target.value))}
              />
            </div>
            <button type="button" className="btn-primary btn-full" disabled={predicting} onClick={runPrediction}>
              Predict condition
            </button>
            <div className="model-result" data-level={modelLevel || undefined} role="status">
              {modelResult}
            </div>
            <p className="model-status">{modelStatus}</p>
          </div>

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
        </div>
      </div>
    </div>
  )
}
