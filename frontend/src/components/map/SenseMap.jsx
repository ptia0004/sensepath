import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, Polyline, useMap, useMapEvents } from 'react-leaflet'
import { CBD, REPORT_TYPES } from '../../constants'
import { markerIcon, refugeLabel, typeLabel } from '../../utils/markers'

function MapClickHandler({ onClick }) {
  useMapEvents({
    click(event) {
      onClick?.(event.latlng.lat, event.latlng.lng)
    },
  })
  return null
}

function FitRoutes({ routes }) {
  const map = useMap()
  useEffect(() => {
    if (!routes?.length) return
    const latLngs = routes.flatMap((route) => route.points.map((p) => [p.lat, p.lng]))
    if (latLngs.length) map.fitBounds(latLngs, { padding: [30, 30] })
  }, [map, routes])
  return null
}

function FlyTo({ target }) {
  const map = useMap()
  useEffect(() => {
    if (!target) return
    map.flyTo([target.lat, target.lng], target.zoom || 17)
  }, [map, target])
  return null
}

/**
 * Reusable Leaflet map used by Community Map, Report Step 2, and Published.
 */
export default function SenseMap({
  heightClass = 'map-large',
  center = CBD,
  zoom = 15,
  onClick,
  reports = [],
  filters = {},
  preferencesFilter = () => true,
  showStress = true,
  stressZones = [],
  showRefuges = false,
  refuges = [],
  routes = [],
  routeStyles = [],
  pickMarkers = [],
  flyTo = null,
  children,
}) {
  return (
    <div className={heightClass}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={zoom}
        className="leaflet-map-host"
        scrollWheelZoom
      >
        <TileLayer
          attribution="&copy; OpenStreetMap"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <MapClickHandler onClick={onClick} />
        <FitRoutes routes={routes} />
        <FlyTo target={flyTo} />

        {showStress &&
          stressZones.map((zone) => {
            const isHigh = zone.level === 'high'
            return (
              <Circle
                key={zone.id}
                center={[zone.lat, zone.lng]}
                radius={zone.radius}
                pathOptions={{
                  color: isHigh ? '#991b1b' : '#b45309',
                  weight: 1,
                  fillColor: isHigh ? '#b91c1c' : '#d97706',
                  fillOpacity: isHigh ? 0.28 : 0.2,
                }}
              >
                <Popup>
                  <strong>{zone.name}</strong>
                  <br />
                  {isHigh
                    ? 'High pedestrian stress (simulated)'
                    : 'Medium pedestrian stress (simulated)'}
                </Popup>
              </Circle>
            )
          })}

        {reports
          .filter((r) => filters[r.type] !== false && preferencesFilter(r.type))
          .map((report) => (
            <Marker
              key={report.id}
              position={[report.lat, report.lng]}
              icon={markerIcon(REPORT_TYPES[report.type]?.letter || '?')}
            >
              <Popup>
                <strong>{report.title}</strong>
                <br />
                {report.street}
                <br />
                Reported {report.minsAgo} min ago
              </Popup>
            </Marker>
          ))}

        {showRefuges &&
          refuges.map((refuge) => (
            <Marker
              key={refuge.id}
              position={[refuge.lat, refuge.lng]}
              icon={markerIcon(refugeLabel(refuge.type), 'refuge')}
            >
              <Popup>
                <strong>{refuge.name}</strong>
                <br />
                {typeLabel(refuge.type)} · ~{refuge.distanceM} m
              </Popup>
            </Marker>
          ))}

        {routes.map((route, index) => (
          <Polyline
            key={`${route.name}-${index}`}
            positions={route.points.map((p) => [p.lat, p.lng])}
            pathOptions={{
              color: routeStyles[index]?.color || '#6b7280',
              weight: index === 0 ? 6 : 4,
              opacity: 0.8,
              dashArray: index === 0 ? null : '8 6',
            }}
          >
            <Popup>
              {route.name} · score {route.score}/100
            </Popup>
          </Polyline>
        ))}

        {pickMarkers.map((marker) => (
          <Marker
            key={marker.id}
            position={[marker.lat, marker.lng]}
            icon={markerIcon(marker.letter, marker.className || '')}
            draggable={Boolean(marker.onDragEnd)}
            eventHandlers={
              marker.onDragEnd
                ? {
                    dragend: (event) => {
                      const { lat, lng } = event.target.getLatLng()
                      marker.onDragEnd(lat, lng)
                    },
                  }
                : undefined
            }
          >
            {marker.popup ? <Popup>{marker.popup}</Popup> : null}
          </Marker>
        ))}
      </MapContainer>
      {children}
    </div>
  )
}
