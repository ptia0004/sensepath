/** Shared constants for SensePath frontend */

export const CBD = { lat: -37.8136, lng: 144.9631 }

export const CLOUD_API_BASE =
  'https://sensepath-api-372335509396.australia-southeast2.run.app'

export const REPORT_TYPES = {
  crowds: { label: 'Crowds', filter: 'crowds', letter: 'C' },
  loud: { label: 'Loud event', filter: 'loud', letter: 'L' },
  roadworks: { label: 'Roadworks', filter: 'roadworks', letter: 'R' },
  heavy: { label: 'Heavy crowds', filter: 'heavy', letter: 'H' },
  other: { label: 'Other sensory issue', filter: 'other', letter: 'O' },
}

export const ASSET_TYPES = [
  'Seat',
  'Drinking Fountain',
  'Picnic Setting',
  'Barbeque',
  'Information Pillar',
]

export const PREFERENCES_KEY = 'sensepath.preferences.v1'

export const DEFAULT_PREFERENCES = {
  crowdTolerance: 'medium',
  avoidLoud: true,
  avoidRoadworks: true,
}

export const MOCK_STRESS_ZONES = [
  { id: 's1', name: 'Swanston St corridor', level: 'high', lat: -37.8145, lng: 144.9638, radius: 180 },
  { id: 's2', name: 'Bourke Street Mall', level: 'high', lat: -37.8136, lng: 144.9648, radius: 140 },
  { id: 's3', name: 'Flinders St Station', level: 'medium', lat: -37.8183, lng: 144.9671, radius: 200 },
  { id: 's4', name: 'Spencer St precinct', level: 'medium', lat: -37.8148, lng: 144.9535, radius: 160 },
]

export const FALLBACK_REFUGES = [
  { id: 'f1', name: 'State Library of Victoria', type: 'library', lat: -37.8098, lng: 144.9652, distanceM: 420 },
  { id: 'f2', name: 'Flagstaff Gardens', type: 'park', lat: -37.8106, lng: 144.9544, distanceM: 780 },
  { id: 'f3', name: 'Birrarung Marr', type: 'park', lat: -37.8190, lng: 144.9730, distanceM: 950 },
  { id: 'f4', name: 'City Library', type: 'library', lat: -37.8148, lng: 144.9665, distanceM: 310 },
  { id: 'f5', name: 'Queen Victoria Gardens', type: 'park', lat: -37.8225, lng: 144.9715, distanceM: 1200 },
  { id: 'f6', name: 'Quiet foyer · Town Hall', type: 'quiet', lat: -37.8152, lng: 144.9668, distanceM: 260 },
]

export const PAGE_SUBTITLES = {
  home: 'Homepage',
  routes: 'Quiet route comparison',
  ai: 'AI prediction',
  report1: 'Report a Sensory Issue · Step 1 of 2',
  report2: 'Report a Sensory Issue · Step 2 of 2',
  published: 'Report Published',
}

export const ROUTE_STYLES = [
  { className: 'recommended', label: 'Solid green', color: '#15803d' },
  { className: 'second', label: 'Blue dashed', color: '#2563eb' },
  { className: 'third', label: 'Grey dashed', color: '#6b7280' },
]
