import { useState } from 'react'
import { CBD, MOCK_STRESS_ZONES, ROUTE_STYLES } from '../constants'
import { reportAllowedByPreferences, roundCoord, scoreRoute, uniqueRoutes, nameRankedRoutes } from '../utils/geo'
import { buildWalkingRoutePlans } from '../utils/routing'
import SenseMap from '../components/map/SenseMap'

/**
 * Quiet route comparison tool — own page with map picking.
 */
export default function RoutesPage({
  reports,
  refuges,
  preferences,
  setPreferences,
  preferencesStatus,
  savePreferences,
}) {
  const [routeStart, setRouteStart] = useState(null)
  const [routeEnd, setRouteEnd] = useState(null)
  const [pickMode, setPickMode] = useState(null)
  const [routeStatus, setRouteStatus] = useState(
    'Click “1. Set start on map”, then click the map as many times as you like. Click “2” when ready to confirm start and set destination.',
  )
  const [routeResults, setRouteResults] = useState([])
  const [routeNote, setRouteNote] = useState('')
  const [comparing, setComparing] = useState(false)

  const pickMarkers = [
    routeStart && {
      id: 'start',
      lat: routeStart.lat,
      lng: routeStart.lng,
      letter: 'S',
      popup: `Route start<br>${roundCoord(routeStart.lat).toFixed(4)}, ${roundCoord(routeStart.lng).toFixed(4)}`,
      onDragEnd: (lat, lng) => setRouteStart({ lat: roundCoord(lat), lng: roundCoord(lng) }),
    },
    routeEnd && {
      id: 'end',
      lat: routeEnd.lat,
      lng: routeEnd.lng,
      letter: 'D',
      popup: `Route destination<br>${roundCoord(routeEnd.lat).toFixed(4)}, ${roundCoord(routeEnd.lng).toFixed(4)}`,
      onDragEnd: (lat, lng) => setRouteEnd({ lat: roundCoord(lat), lng: roundCoord(lng) }),
    },
  ].filter(Boolean)

  function handleMapClick(lat, lng) {
    const rounded = { lat: roundCoord(lat), lng: roundCoord(lng) }
    if (pickMode === 'route-start') {
      setRouteStart(rounded)
      setRouteStatus('Start updated. Keep clicking to move it, or click “2. Set destination on map” to confirm and continue.')
      return
    }
    if (pickMode === 'route-end') {
      setRouteEnd(rounded)
      setRouteStatus('Destination updated. Keep clicking to move it, then Compare.')
    }
  }

  async function compareRoutes() {
    if (!routeStart || !routeEnd) {
      setRouteNote('Set both a start (S) and destination (D) before comparing.')
      return
    }
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
    <div className="page active" id="routes">
      <p className="page-desc">
        Compare walking corridors using community reports and sensory preferences. Assistive guidance
        only — not turn-by-turn navigation.
      </p>
      <div className="content-grid">
        <div className="map-column">
          <SenseMap
            onClick={handleMapClick}
            reports={reports}
            filters={{ crowds: true, loud: true, roadworks: true, heavy: true, other: true }}
            preferencesFilter={(type) => reportAllowedByPreferences(type, preferences)}
            showStress
            stressZones={MOCK_STRESS_ZONES}
            showRefuges
            refuges={refuges}
            routes={routeResults}
            routeStyles={ROUTE_STYLES}
            pickMarkers={pickMarkers}
          />
        </div>

        <div className="sidebar-stack">
          <div className="card-sm model-card route-card">
            <h3>Quiet route comparison</h3>
            <p className="model-note">
              Pick start and destination on the map, then compare three walking routes planned along
              the street network.
            </p>
            <div className="route-pick-row">
              <button
                type="button"
                className={`btn-pick ${pickMode === 'route-start' ? 'active' : ''}`}
                onClick={() => {
                  setPickMode('route-start')
                  setRouteStart(null)
                  setRouteEnd(null)
                  setRouteResults([])
                  setRouteNote('')
                  setRouteStatus(
                    'Start picking is on — click the map to place or move the start. Click “2” when ready to confirm.',
                  )
                }}
              >
                1. Set start on map
              </button>
              <button
                type="button"
                className={`btn-pick ${pickMode === 'route-end' ? 'active' : ''}`}
                onClick={() => {
                  if (!routeStart) {
                    setRouteStatus('Set a start point first with “1. Set start on map”.')
                    return
                  }
                  setPickMode('route-end')
                  setRouteEnd(null)
                  setRouteStatus(
                    'Start confirmed. Destination picking is on — click the map to place or move the destination.',
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
                <span>{routeStart ? `${routeStart.lat}, ${routeStart.lng}` : 'Not set'}</span>
              </div>
              <div>
                <strong>Destination</strong>
                <span>{routeEnd ? `${routeEnd.lat}, ${routeEnd.lng}` : 'Not set'}</span>
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
                    value={routeStart?.lat ?? ''}
                    onChange={(e) =>
                      setRouteStart({
                        lat: Number(e.target.value),
                        lng: routeStart?.lng ?? CBD.lng,
                      })
                    }
                  />
                </div>
                <div className="model-field">
                  <label>Start longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={routeStart?.lng ?? ''}
                    onChange={(e) =>
                      setRouteStart({
                        lat: routeStart?.lat ?? CBD.lat,
                        lng: Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div className="model-field">
                  <label>Destination latitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={routeEnd?.lat ?? ''}
                    onChange={(e) =>
                      setRouteEnd({
                        lat: Number(e.target.value),
                        lng: routeEnd?.lng ?? CBD.lng,
                      })
                    }
                  />
                </div>
                <div className="model-field">
                  <label>Destination longitude</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={routeEnd?.lng ?? ''}
                    onChange={(e) =>
                      setRouteEnd({
                        lat: routeEnd?.lat ?? CBD.lat,
                        lng: Number(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
            </details>
            <button type="button" className="btn-primary btn-full" disabled={comparing} onClick={compareRoutes}>
              Compare route corridors
            </button>
            <div className="route-line-legend" aria-label="Map corridor line legend">
              {ROUTE_STYLES.slice(0, Math.max(routeResults.length, 1)).map((style, index) => (
                <div
                  className="route-legend-item"
                  key={style.className}
                  style={{ display: index < Math.max(routeResults.length, 1) ? 'flex' : 'none' }}
                >
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
              Saved on this device and applied to report visibility and route scoring.
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
    </div>
  )
}
