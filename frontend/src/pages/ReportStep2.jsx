import { useState } from 'react'
import { CBD, REPORT_TYPES } from '../constants'
import { apiFetch, apiErrorMessage, reportFromApi } from '../api/client'
import { roundCoord } from '../utils/geo'
import SenseMap from '../components/map/SenseMap'

function newSubmissionKey() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0
    const value = character === 'x' ? random : (random & 3) | 8
    return value.toString(16)
  })
}

export default function ReportStep2({ category, onBack, onSubmitted, reloadReports }) {
  const [lat, setLat] = useState(CBD.lat)
  const [lng, setLng] = useState(CBD.lng)
  const [locationLabel, setLocationLabel] = useState('Melbourne CBD')
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(false)
    setStatus('Submitting report...')
    try {
      const response = await apiFetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          latitude: Number(lat),
          longitude: Number(lng),
          location_label: locationLabel,
          comment,
          submission_key: newSubmissionKey(),
        }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Report submission failed')
      const report = reportFromApi(body.report)
      setComment('')
      setStatus('')
      await reloadReports?.()
      onSubmitted(report)
    } catch (err) {
      setError(true)
      setStatus(apiErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page active" id="report2">
      <p className="page-desc">Confirm location, add an optional note, then publish the report.</p>
      <div className="confirm-grid">
        <div className="map-confirm-wrap">
          <SenseMap
            heightClass="map-confirm"
            zoom={15}
            onClick={(clickLat, clickLng) => {
              setLat(roundCoord(clickLat))
              setLng(roundCoord(clickLng))
            }}
            pickMarkers={[
              {
                id: 'report-location',
                lat,
                lng,
                letter: '!',
                popup: `Current report location<br>${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`,
                onDragEnd: (dragLat, dragLng) => {
                  setLat(roundCoord(dragLat))
                  setLng(roundCoord(dragLng))
                },
              },
            ]}
          />
          <p className="map-hint">Click the map to set Approximate coordinates.</p>
        </div>

        <div className="card-sm confirm-card">
          <h3>Confirm report</h3>
          <div className="field-group">
            <p className="field-label">Category</p>
            <p className="field-value">{REPORT_TYPES[category]?.label || category}</p>
          </div>
          <div className="field-group">
            <p className="field-label">Location</p>
            <input
              maxLength={200}
              value={locationLabel}
              onChange={(e) => setLocationLabel(e.target.value)}
              aria-label="Location label"
            />
          </div>
          <div className="field-group">
            <p className="field-label">Approximate coordinates</p>
            <input
              type="number"
              step="0.0001"
              value={lat}
              onChange={(e) => setLat(Number(e.target.value))}
              aria-label="Report latitude"
            />
            <input
              type="number"
              step="0.0001"
              value={lng}
              onChange={(e) => setLng(Number(e.target.value))}
              aria-label="Report longitude"
            />
          </div>
          <div className="field-group">
            <p className="field-label">Optional note</p>
            <textarea
              maxLength={300}
              placeholder="Add useful context..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <button type="button" className="btn-primary btn-full" disabled={submitting} onClick={submit}>
            Submit report
          </button>
          <p className={`report-submit-status ${error ? 'error' : ''}`} role="status" aria-live="polite">
            {status}
          </p>
          <div className="submit-footer">
            <p>Reports include timestamp and location metadata.</p>
            <p>Temporary reports expire automatically.</p>
            <button type="button" className="btn-pick" style={{ marginTop: 12 }} onClick={onBack}>
              Back to category
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
