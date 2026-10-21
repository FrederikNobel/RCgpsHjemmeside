import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import TrackMap from './TrackMap'
import { demoTrack, parseTrackFile, type TrackPoint } from './track'
import type { Database } from './database.types'
import { isSupabaseConfigured, supabase } from './supabase'
import './App.css'

type SavedTrip = Database['public']['Tables']['trips']['Row']

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
  const [accountError, setAccountError] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured)
  const [authBusy, setAuthBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [savedTrips, setSavedTrips] = useState<SavedTrip[]>([])
  const [tripsLoading, setTripsLoading] = useState(false)
  const [loadingTripId, setLoadingTripId] = useState<string | null>(null)
  const [currentSavedTripId, setCurrentSavedTripId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!supabase) return

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession)
      setTripsLoading(Boolean(currentSession))
      if (!currentSession) setSavedTrips([])
      setAccountError('')
    })

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setAccountError(`Kunne ikke hente login: ${sessionError.message}`)
      setSession(data.session)
      setTripsLoading(Boolean(data.session))
      setAuthLoading(false)
    }).catch((sessionError: unknown) => {
      const message = sessionError instanceof Error ? sessionError.message : 'Ukendt fejl.'
      setAccountError(`Kunne ikke hente login: ${message}`)
      setAuthLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) return

    let cancelled = false
    void (async () => {
      try {
        const { data, error: queryError } = await supabase
          .from('trips')
          .select('*')
          .order('started_at', { ascending: false })
          .limit(50)
        if (cancelled) return
        if (queryError) {
          setAccountError(`Kunne ikke hente gemte ture: ${queryError.message}`)
          setSavedTrips([])
        } else {
          setSavedTrips(data)
        }
        setTripsLoading(false)
      } catch (queryError) {
        if (cancelled) return
        const message = queryError instanceof Error ? queryError.message : 'Ukendt fejl.'
        setAccountError(`Kunne ikke hente gemte ture: ${message}`)
        setSavedTrips([])
        setTripsLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [session])

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
      setCurrentSavedTripId(null)
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
    setCurrentSavedTripId(null)
  }

  function clearTrack() {
    setTrack([])
    setTrackName('')
    setError('')
    setCurrentSavedTripId(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return

    setAccountError('')
    setAuthBusy(true)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setAccountError(`Kunne ikke logge ind: ${signInError.message}`)
    else setPassword('')
    setAuthBusy(false)
  }

  async function signOut() {
    if (!supabase) return
    setAccountError('')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) setAccountError(`Kunne ikke logge ud: ${signOutError.message}`)
  }

  async function loadSavedTrip(savedTrip: SavedTrip) {
    if (!supabase) return
    setAccountError('')
    setLoadingTripId(savedTrip.id)
    const { data, error: queryError } = await supabase
      .from('gps_samples')
      .select('recorded_at, latitude, longitude, speed_kmh')
      .eq('trip_id', savedTrip.id)
      .order('sample_index', { ascending: true })

    if (queryError) {
      setAccountError(`Kunne ikke hente turen: ${queryError.message}`)
    } else if (data.length < 2) {
      setAccountError('Den gemte tur har færre end to GPS-målinger.')
    } else {
      setTrack(
        data.map((sample) => ({
          latitude: sample.latitude,
          longitude: sample.longitude,
          speedKmh: sample.speed_kmh,
          timestamp: Date.parse(sample.recorded_at),
        })),
      )
      setTrackName(savedTrip.name)
      setCurrentSavedTripId(savedTrip.id)
      setError('')
    }
    setLoadingTripId(null)
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
          Gemmes kun når du vælger det
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

          <section className="account-panel" aria-label="Supabase-konto">
            <div className="account-heading">
              <div>
                <p className="eyebrow">PRIVAT ARKIV</p>
                <h2>{session ? 'Din konto' : 'Log ind'}</h2>
              </div>
              {session && <span className="live-status"><span /> TILSLUTTET</span>}
            </div>
            {!isSupabaseConfigured ? (
              <p className="account-note">
                Supabase mangler konfiguration. Tilføj projektets URL og publishable key i
                miljøvariablerne.
              </p>
            ) : authLoading ? (
              <p className="account-note">Kontrollerer login...</p>
            ) : session ? (
              <>
                <p className="account-email">{session.user.email}</p>
                <button className="demo-button account-action" type="button" onClick={() => void signOut()}>
                  Log ud
                </button>
                <div className="saved-trips">
                  <span className="stat-label">GEMTE TURE</span>
                  {tripsLoading ? (
                    <p className="account-note">Henter ture...</p>
                  ) : savedTrips.length === 0 ? (
                    <p className="account-note">Dit arkiv er tomt. Gem en importeret tur for at starte.</p>
                  ) : (
                    savedTrips.map((savedTrip) => (
                      <button
                        className={`saved-trip${savedTrip.id === currentSavedTripId ? ' selected' : ''}`}
                        key={savedTrip.id}
                        type="button"
                        disabled={loadingTripId !== null}
                        onClick={() => void loadSavedTrip(savedTrip)}
                      >
                        <strong>{loadingTripId === savedTrip.id ? 'Henter tur...' : savedTrip.name}</strong>
                        <span>{new Date(savedTrip.started_at).toLocaleString()}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <form className="login-form" onSubmit={(event) => void signIn(event)}>
                <label>
                  E-mail
                  <input
                    autoComplete="username"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.currentTarget.value)}
                    required
                  />
                </label>
                <label>
                  Adgangskode
                  <input
                    autoComplete="current-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                  />
                </label>
                <button className="save-track-button" type="submit" disabled={authBusy}>
                  {authBusy ? 'Logger ind...' : 'Log ind'}
                </button>
                <p className="account-note">Kontoen oprettes privat i Supabase — der er ikke offentlig tilmelding.</p>
              </form>
            )}
            {accountError && <p className="error-message" role="alert">{accountError}</p>}
          </section>

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
            <span aria-hidden="true">⌑</span> Importerede filer bliver lokalt på enheden.
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
