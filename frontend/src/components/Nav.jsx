import { PAGE_SUBTITLES } from '../constants'

const LINKS = [
  { id: 'home', label: 'Homepage' },
  { id: 'routes', label: 'Quiet routes' },
  { id: 'ai', label: 'AI facility' },
]

function isActive(page, linkId) {
  return page === linkId
}

export default function Nav({ page, onNavigate }) {
  return (
    <nav className="nav">
      <div className="nav-brand">
        <span className="nav-logo">SensePath</span>
        <span className="nav-subtitle">{PAGE_SUBTITLES[page] || 'Community Sensory Map'}</span>
      </div>
      <div className="nav-links">
        {LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            className={isActive(page, link.id) ? 'active' : ''}
            onClick={(event) => {
              event.preventDefault()
              onNavigate(link.id)
            }}
          >
            {link.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
