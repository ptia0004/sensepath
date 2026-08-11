import { useState } from 'react'
import { ASSET_TYPES, CBD, MOCK_STRESS_ZONES } from '../constants'
import { apiFetch, apiErrorMessage } from '../api/client'
import { roundCoord } from '../utils/geo'
import SenseMap from '../components/map/SenseMap'

/**
 * AI facility condition tool — click map to fill coordinates.
 */
export default function AiPage({ modelStatus }) {
  const [assetType, setAssetType] = useState('Seat')
  const [modelLat, setModelLat] = useState(CBD.lat)
  const [modelLng, setModelLng] = useState(CBD.lng)
  const [modelResult, setModelResult] = useState('Select an asset and run the deployed model.')
  const [modelLevel, setModelLevel] = useState('')
  const [predicting, setPredicting] = useState(false)

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
  ]

  function handleMapClick(lat, lng) {
    setModelLat(roundCoord(lat))
    setModelLng(roundCoord(lng))
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

  return (
    <div className="page active" id="ai">
      <p className="page-desc">
        Estimate street-furniture condition from asset type and location. Click the map or drag marker
        A to set coordinates.
      </p>
      <div className="content-grid">
        <div className="map-column">
          <SenseMap
            onClick={handleMapClick}
            reports={[]}
            filters={{ crowds: false, loud: false, roadworks: false, heavy: false, other: false }}
            showStress={false}
            stressZones={MOCK_STRESS_ZONES}
            showRefuges={false}
            refuges={[]}
            pickMarkers={pickMarkers}
          />
        </div>

        <div className="sidebar-stack">
          <div className="card-sm model-card ai-card">
            <h3>AI facility condition</h3>
            <p className="model-note">
              Estimates street-furniture condition from asset type and location. It is not a live crowd
              or noise prediction.
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
        </div>
      </div>
    </div>
  )
}
