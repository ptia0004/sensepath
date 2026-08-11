import { REPORT_TYPES } from '../constants'

const CATEGORY_OPTIONS = [
  { key: 'crowds', label: 'Crowds' },
  { key: 'loud', label: 'Protest / loud event' },
  { key: 'roadworks', label: 'Roadworks' },
  { key: 'heavy', label: 'Heavy crowds' },
  { key: 'other', label: 'Other sensory issue' },
]

export default function ReportStep1({ category, setCategory, onNext, onBack }) {
  return (
    <div className="page active" id="report1">
      <p className="page-desc">Designed to submit a temporary sensory hazard in fewer than three steps.</p>
      <div className="card step-card">
        <h2>What did you encounter?</h2>
        <p className="step-desc">Choose one category.</p>
        <div className="radio-group" role="radiogroup" aria-label="Sensory issue category">
          {CATEGORY_OPTIONS.map((option) => (
            <div
              key={option.key}
              className={`radio-item ${category === option.key ? 'selected' : ''}`}
              role="radio"
              tabIndex={0}
              aria-checked={category === option.key}
              onClick={() => setCategory(option.key)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setCategory(option.key)
                }
              }}
            >
              <div className="radio-circle">
                <div className="radio-circle-inner" />
              </div>
              <span>{option.label}</span>
            </div>
          ))}
        </div>
        <div className="step-footer">
          <span className="step-hint">
            Step 1: Category → Step 2: Confirm location & submit · {REPORT_TYPES[category]?.label}
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button type="button" className="btn-pick" onClick={onBack}>
              Back
            </button>
            <button type="button" className="btn-primary" onClick={onNext}>
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
