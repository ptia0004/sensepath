/** Geospatial helpers for route scoring */

export function roundCoord(value) {
  return Math.round(Number(value) * 10000) / 10000
}

export function distanceMetres(a, b) {
  const radius = 6371000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * radius * Math.asin(Math.sqrt(h))
}

export function distanceToSegmentMetres(point, start, end) {
  const toXY = (p) => ({
    x: (p.lng - start.lng) * 111320 * Math.cos((point.lat * Math.PI) / 180),
    y: (p.lat - start.lat) * 110540,
  })
  const p = toXY(point)
  const a = toXY(start)
  const b = toXY(end)
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lengthSq = abx * abx + aby * aby
  if (lengthSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

export function distanceToRouteMetres(point, points) {
  let closest = Infinity
  for (let i = 0; i < points.length - 1; i += 1) {
    closest = Math.min(closest, distanceToSegmentMetres(point, points[i], points[i + 1]))
  }
  return closest
}

export function reportAllowedByPreferences(type, preferences) {
  if (type === 'crowds') return preferences.crowdTolerance === 'low'
  if (type === 'heavy') return preferences.crowdTolerance !== 'high'
  if (type === 'loud') return preferences.avoidLoud
  if (type === 'roadworks') return preferences.avoidRoadworks
  return true
}

export function reportPenalty(report, preferences) {
  if (report.type === 'crowds') return preferences.crowdTolerance === 'low' ? 22 : 5
  if (report.type === 'heavy') return preferences.crowdTolerance === 'high' ? 8 : 32
  if (report.type === 'loud') return preferences.avoidLoud ? 26 : 5
  if (report.type === 'roadworks') return preferences.avoidRoadworks ? 30 : 6
  return 15
}

export function scoreRoute(name, points, directDistance, communityReports, refuges, preferences) {
  let distance = 0
  for (let i = 0; i < points.length - 1; i += 1) {
    distance += distanceMetres(points[i], points[i + 1])
  }
  const nearbyReports = communityReports.filter(
    (report) => distanceToRouteMetres({ lat: report.lat, lng: report.lng }, points) <= 250,
  )
  const nearbyRefuges = refuges.filter(
    (refuge) => distanceToRouteMetres({ lat: refuge.lat, lng: refuge.lng }, points) <= 180,
  )
  const hazardPenalty = nearbyReports.reduce(
    (sum, report) => sum + reportPenalty(report, preferences),
    0,
  )
  const distancePenalty = Math.max(0, (distance / directDistance - 1) * 35)
  const refugeBenefit = Math.min(20, nearbyRefuges.length * 4)
  const score = Math.max(0, Math.min(100, 20 + hazardPenalty + distancePenalty - refugeBenefit))
  return {
    name,
    points,
    distance: Math.round(distance),
    score: Math.round(score),
    reports: nearbyReports.length,
    refuges: nearbyRefuges.length,
  }
}

export function routesAreSimilar(a, b) {
  if (Math.abs(a.distance - b.distance) > 60) return false
  const midA = a.points[Math.floor(a.points.length / 2)]
  const midB = b.points[Math.floor(b.points.length / 2)]
  if (!midA || !midB) return Math.abs(a.distance - b.distance) <= 40
  return distanceMetres(midA, midB) < 100
}

export function uniqueRoutes(routes) {
  const unique = []
  routes.forEach((route) => {
    if (!unique.some((kept) => routesAreSimilar(kept, route))) unique.push(route)
  })
  return unique
}

export function nameRankedRoutes(routes) {
  return routes.map((route, index) => ({
    ...route,
    name: index === 0 ? 'Recommended route' : `Route ${index}`,
  }))
}
