import { useRef, useState } from 'react'
import TrackMap from './TrackMap'
import { demoTrack, parseTrackFile, type TrackPoint } from './track'
import './App.css'

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function calculateDistance(points: TrackPoint[]) {
  const earthRadiusMeters = 6_371_000
  let distance = 0

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    const latitudeDelta = ((current.latitude - previous.latitude) * Math.PI) / 180
    const longitudeDelta = ((current.longitude - previous.longitude) * Math.PI) / 180
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos((previous.latitude * Math.PI) / 180) *
        Math.cos((current.latitude * Math.PI) / 180) *
        Math.sin(longitudeDelta / 2) ** 2

    distance += 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }

  return distance
}

function App() {
  const [track, setTrack] = useState<TrackPoint[]>([])
  const [trackName, setTrackName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const speeds = track.map((point) => point.speedKmh)
  const topSpeed = speeds.length > 0 ? Math.max(...speeds) : 0
  const averageSpeed =
    speeds.length > 0 ? speeds.reduce((total, speed) => total + speed, 0) / speeds.length : 0
  const durationSeconds =
    track.length > 1
      ? Math.max(0, (track[track.length - 1].timestamp - track[0].timestamp) / 1000)
      : 0
  const distanceMeters = calculateDistance(track)

  async function loadFile(file: File) {
    setError('')
    setIsLoading(true)

    try {
      const points = await parseTrackFile(file)
      setTrack(points)
      setTrackName(file.name)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Filen kunne ikke læses.')
    } finally {
      setIsLoading(false)
    }
  }

  function loadDemo() {
    setError('')
    setTrack(demoTrack())
    setTrackName('Eksempelstur')
  }

  function clearTrack() {
    setTrack([])
    setTrackName('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RC Track home">
          <span className="brand-mark" aria-hidden="true">
            RC
          </span>
          <span>
            <strong>RC Track</strong>
            <small>Fart &amp; omgangsanalyse</small>
          </span>
        </a>
        <div className="privacy-pill">
          <span className="privacy-dot" />
          Turfiler bliver på enheden
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">DIN TUR, DINE DATA</p>
          <h1>Se hvert sving.</h1>
          <p className="intro-copy">
            Se dine RC-ture på et kort. Importér en tur for at udforske sporet, farten og
            distancen.
          </p>
        </div>
        <div className="intro-badge" aria-hidden="true">
          <span>5</span>
          <small>Hz GPS</small>
        </div>
      </section>

      <section className="workspace" aria-label="Turanalyse">
        <aside className="sidebar">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">TURDATA</p>
              <h2>Importér en tur</h2>
            </div>
            <span className="step-number">01</span>
          </div>

          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            aria-label="Vælg turfil"
            accept=".gpx,.csv,application/gpx+xml,text/csv"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              if (file) void loadFile(file)
            }}
          />

          <button
            className="upload-zone"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault()
              const file = event.dataTransfer.files[0]
              if (file) void loadFile(file)
            }}
          >
            <span className="upload-icon" aria-hidden="true">
              ↑
            </span>
            <strong>{isLoading ? 'Læser turen...' : 'Slip en fil her'}</strong>
            <span>eller vælg fra din enhed</span>
            <small>GPX eller CSV · GPS-koordinater kræves</small>
          </button>

          {error && <p className="error-message" role="alert">{error}</p>}

          <button className="demo-button" type="button" onClick={loadDemo}>
            Se eksempelspor <span aria-hidden="true">↗</span>
          </button>

          {track.length > 0 ? (
            <div className="loaded-track">
              <div className="loaded-track-icon" aria-hidden="true">✓</div>
              <div className="loaded-track-info">
                <strong title={trackName}>{trackName}</strong>
                <span>{track.length.toLocaleString()} GPS-målinger indlæst</span>
              </div>
              <button className="icon-button" type="button" onClick={clearTrack} aria-label="Ryd tur">
                ×
              </button>
            </div>
          ) : (
            <div className="format-note">
              <span className="note-icon" aria-hidden="true">i</span>
              <p>
                ESP32'ens nuværende CSV har tid og fart, men endnu ingen GPS-koordinater. Brug
                eksempelsporet til at prøve kortet; vi kan tilføje koordinater til ESP-eksporten
                bagefter.
              </p>
            </div>
          )}

          <div className="sidebar-divider" />

          <div className="panel-heading stats-heading">
            <div>
              <p className="eyebrow">TURRESUMÉ</p>
              <h2>{track.length > 0 ? 'Denne tur' : 'Venter på en tur'}</h2>
            </div>
            <span className="live-status"><span /> {track.length > 0 ? 'INDLÆST' : 'KLAR'}</span>
          </div>

          <div className="stats-grid">
            <article className="stat-card highlight">
              <span className="stat-label">TOPFART</span>
              <strong>{topSpeed.toFixed(1)} <small>km/t</small></strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">GENNEMSNIT</span>
              <strong>{averageSpeed.toFixed(1)} <small>km/t</small></strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">DISTANCE</span>
              <strong>{distanceMeters >= 1000 ? (distanceMeters / 1000).toFixed(2) : Math.round(distanceMeters)} <small>{distanceMeters >= 1000 ? 'km' : 'm'}</small></strong>
            </article>
            <article className="stat-card">
              <span className="stat-label">VARIGHED</span>
              <strong>{formatDuration(durationSeconds)} <small>min</small></strong>
            </article>
          </div>

          <div className="speed-legend">
            <span className="stat-label">FART PÅ SPORET</span>
            <div className="legend-gradient" />
            <div className="legend-labels"><span>Langsom</span><span>Hurtig</span></div>
          </div>

          <p className="local-note">
            <span aria-hidden="true">⌑</span> Turfiler behandles lokalt og uploades ikke.
          </p>
        </aside>

        <section className="map-panel" aria-label="Banekort">
          <div className="map-toolbar">
            <div>
              <span className="map-title">Banekort</span>
              <span className="map-subtitle">
                {track.length > 0 ? `${track.length} målinger · farvet efter fart` : 'Importér en tur for at se sporet'}
              </span>
            </div>
            <span className="map-source"><span /> OPENSTREETMAP</span>
          </div>
          <TrackMap points={track} />
          <div className="map-footer">
            <span><i className="start-marker" /> START</span>
            <span><i className="finish-marker" /> MÅL</span>
            <span className="map-footer-hint">Træk og zoom for at udforske</span>
          </div>
        </section>
      </section>

      <footer className="page-footer">
        <span>RC TRACK <span aria-hidden="true">·</span> KLAR TIL NÆSTE OMGANG</span>
        <span>Kortdata © OpenStreetMap contributors</span>
      </footer>
    </main>
  )
}

export default App
