/**
 * Full-screen startup loading page shown while API bootstrap runs.
 */
export default function LoadingPage({ message = 'Loading SensePath…' }) {
  return (
    <div className="loading-page" role="status" aria-live="polite" aria-busy="true">
      <div className="loading-card">
        <p className="loading-brand">SensePath</p>
        <p className="loading-tagline">Community Sensory Map</p>
        <div className="loading-spinner" aria-hidden="true" />
        <p className="loading-message">{message}</p>
      </div>
    </div>
  )
}
