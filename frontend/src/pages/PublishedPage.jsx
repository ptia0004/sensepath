import { CBD } from '../constants'
import SenseMap from '../components/map/SenseMap'

export default function PublishedPage({ report, onBackToMap }) {
  const lat = report?.lat ?? CBD.lat
  const lng = report?.lng ?? CBD.lng
  const title = report?.title || 'Report'
  const detail = report ? `Just now · ${report.street}` : 'Just now'

  return (
    <div className="page active" id="published">
      <p className="page-desc">
        New community reports appear on the sensory map and can help other commuters.
      </p>
      <div className="published-grid">
        <SenseMap
          heightClass="map-published"
          center={{ lat, lng }}
          zoom={16}
          pickMarkers={[
            {
              id: 'published',
              lat,
              lng,
              letter: '!',
              popup: (
                <>
                  <strong>{title}</strong>
                  <br />
                  {detail}
                </>
              ),
            },
          ]}
        />
        <div className="sidebar-stack">
          <div className="card-sm success-card">
            <h3>Report submitted</h3>
            <p>Your report is now visible to nearby commuters.</p>
            <p>
              <strong>{title}</strong>
            </p>
            <p>{detail}</p>
            <p className="expire-note">It will expire after the configured period.</p>
          </div>
          <div className="card-sm controls-card">
            <h3>Community map controls</h3>
            <p>Filter by category</p>
            <p>View report timestamp</p>
            <p>Hide expired reports</p>
            <p>Moderate duplicate / inappropriate reports</p>
          </div>
          <button type="button" className="btn-primary btn-full" onClick={onBackToMap}>
            Back to community map
          </button>
        </div>
      </div>
    </div>
  )
}
