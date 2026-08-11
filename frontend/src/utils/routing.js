import { distanceMetres } from './geo'

function fallbackStreetLikePath(start, end, bias) {
  const midLat = (start.lat + end.lat) / 2 + (bias?.lat || 0)
  const midLng = (start.lng + end.lng) / 2 + (bias?.lng || 0)
  return [
    start,
    { lat: start.lat, lng: midLng },
    { lat: midLat, lng: midLng },
    { lat: end.lat, lng: midLng },
    end,
  ]
}

async function fetchWalkingRoute(waypoints) {
  const coords = waypoints.map((point) => `${point.lng},${point.lat}`).join(';')
  const response = await fetch(
    `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson`,
  )
  if (!response.ok) throw new Error(`Routing service returned ${response.status}`)
  const body = await response.json()
  if (!body.routes?.[0]?.geometry) throw new Error('No walking route found')
  return body.routes[0].geometry.coordinates.map((pair) => ({
    lat: pair[1],
    lng: pair[0],
  }))
}

/** Build 3 walking route candidates via OSRM (with street-like fallback). */
export async function buildWalkingRoutePlans(start, end) {
  const midpoint = {
    lat: (start.lat + end.lat) / 2,
    lng: (start.lng + end.lng) / 2,
  }
  const westVia = { lat: midpoint.lat + 0.0018, lng: midpoint.lng - 0.0028 }
  const eastVia = { lat: midpoint.lat - 0.0018, lng: midpoint.lng + 0.0028 }

  try {
    const paths = await Promise.all([
      fetchWalkingRoute([start, end]),
      fetchWalkingRoute([start, westVia, end]),
      fetchWalkingRoute([start, eastVia, end]),
    ])
    return {
      source: 'street-network',
      paths: [
        { name: 'candidate-a', points: paths[0] },
        { name: 'candidate-b', points: paths[1] },
        { name: 'candidate-c', points: paths[2] },
      ],
      directDistance: Math.max(1, distanceMetres(start, end)),
    }
  } catch (error) {
    console.warn('Street routing unavailable, using fallback:', error)
    return {
      source: 'fallback',
      paths: [
        { name: 'candidate-a', points: fallbackStreetLikePath(start, end, null) },
        { name: 'candidate-b', points: fallbackStreetLikePath(start, end, { lat: 0.0018, lng: -0.0028 }) },
        { name: 'candidate-c', points: fallbackStreetLikePath(start, end, { lat: -0.0018, lng: 0.0028 }) },
      ],
      directDistance: Math.max(1, distanceMetres(start, end)),
    }
  }
}
