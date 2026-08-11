import L from 'leaflet'

export function markerIcon(html, className = '') {
  return L.divIcon({
    className: '',
    html: `<div class="sp-marker ${className}">${html}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

export function refugeLabel(type) {
  if (type === 'library') return 'L'
  if (type === 'park') return 'P'
  return 'Q'
}

export function typeLabel(type) {
  if (type === 'library') return 'Library'
  if (type === 'park') return 'Park'
  return 'Quiet space'
}

export function refugeTypeFromApi(item) {
  const description = `${item.subtype || ''} ${item.name || ''}`.toLowerCase()
  if (description.includes('library')) return 'library'
  if (description.includes('park') || description.includes('garden') || description.includes('reserve')) {
    return 'park'
  }
  return 'quiet'
}
