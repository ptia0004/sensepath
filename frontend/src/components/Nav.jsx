import { PAGE_SUBTITLES } from '../constants'

export default function Nav({ page, onNavigate }) {
  const links = [
    { id: 'map', label: 'Community Map' },
    { id: 'report1', label: 'Report Step 1' },
    { id: 'report2', label: 'Report Step 2' },
    { id: 'published', label: 'Published' },
  ]

  return (
    <nav className="nav">
      <span className="nav-logo">SensePath</span>
      <span className="nav-subtitle">{PAGE_SUBTITLES[page]}</span>
      <div className="nav-links">
        {links.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            className={page === link.id ? 'active' : ''}
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
