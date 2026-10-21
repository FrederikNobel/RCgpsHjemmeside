import { useEffect, useRef } from 'react'
import L from 'leaflet'
import type { TrackPoint } from './track'

interface TrackMapProps {
  points: TrackPoint[]
}

function speedColor(speedKmh: number) {
  const hue = Math.max(0, 130 - Math.min(speedKmh, 80) * 1.55)
  return `hsl(${hue} 88% 55%)`
}

function createEndpointIcon(label: 'S' | 'F', color: string) {
  return L.divIcon({
    className: 'track-endpoint-icon',
    html: `<span style="background:${color}">${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

function TrackMap({ points }: TrackMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const trackLayerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      zoomControl: false,
      preferCanvas: true,
    }).setView([55.6761, 12.5683], 12)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    L.control.zoom({ position: 'bottomright' }).addTo(map)

    mapRef.current = map
    trackLayerRef.current = L.layerGroup().addTo(map)

    const resizeObserver = new ResizeObserver(() => map.invalidateSize())
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
      trackLayerRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    const layer = trackLayerRef.current
    if (!map || !layer) return

    layer.clearLayers()
    if (points.length < 2) return

    points.slice(1).forEach((point, index) => {
      const previous = points[index]
      const averageSpeed = (previous.speedKmh + point.speedKmh) / 2
      L.polyline(
        [
          [previous.latitude, previous.longitude],
          [point.latitude, point.longitude],
        ],
        {
          color: speedColor(averageSpeed),
          weight: 6,
          opacity: 0.92,
          lineCap: 'round',
          lineJoin: 'round',
        },
      ).addTo(layer)
    })

    const start = points[0]
    const finish = points[points.length - 1]
    L.marker([start.latitude, start.longitude], {
      icon: createEndpointIcon('S', '#75e6c5'),
      title: 'Start',
      keyboard: false,
    }).addTo(layer)
    L.marker([finish.latitude, finish.longitude], {
      icon: createEndpointIcon('F', '#ff6b76'),
      title: 'Finish',
      keyboard: false,
    }).addTo(layer)

    const bounds = L.latLngBounds(points.map((point) => [point.latitude, point.longitude]))
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 18 })
  }, [points])

  return (
    <div className="map-canvas" role="region" aria-label="Banekort">
      <div ref={containerRef} className="leaflet-map" />
      {points.length === 0 && (
        <div className="map-empty-state">
          <span className="empty-map-icon" aria-hidden="true">⌖</span>
          <strong>Dit spor vises her</strong>
          <span>Importér en GPX eller en CSV med GPS-koordinater for at komme i gang.</span>
        </div>
      )}
    </div>
  )
}

export default TrackMap
