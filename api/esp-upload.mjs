import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const MAX_SAMPLES = 3000
const MAX_BODY_BYTES = 1_000_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

function isIsoTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value))
}

function hasValidBearerToken(header, expectedToken) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
  const provided = Buffer.from(header.slice(7))
  const expected = Buffer.from(expectedToken)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function validatePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Invalid request body.'
  const { trip, samples } = body
  if (!trip || typeof trip !== 'object' || Array.isArray(trip)) return 'Trip metadata is required.'
  if (!UUID_PATTERN.test(trip.id ?? '')) return 'Trip id must be a UUID.'
  if (typeof trip.name !== 'string' || trip.name.length < 1 || trip.name.length > 120) {
    return 'Trip name must be between 1 and 120 characters.'
  }
  if (!isIsoTimestamp(trip.started_at) || !isIsoTimestamp(trip.ended_at)) {
    return 'Trip start and end timestamps must be valid ISO dates.'
  }
  if (Date.parse(trip.ended_at) < Date.parse(trip.started_at)) {
    return 'Trip end time cannot be before its start time.'
  }
  const laps = trip.laps ?? []
  if (
    !Array.isArray(laps) ||
    laps.length > 30 ||
    laps.some((duration) => !Number.isInteger(duration) || duration < 5000 || duration > 0xffffffff)
  ) {
    return 'Lap durations must be between 5000 ms and 4294967295 ms.'
  }
  if (!Array.isArray(samples) || samples.length < 2 || samples.length > MAX_SAMPLES) {
    return `Trip must contain between 2 and ${MAX_SAMPLES} samples.`
  }

  let previousTimestamp = -Infinity
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]
    if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
      return `Sample ${index} is invalid.`
    }
    if (sample.sample_index !== index) return 'Sample indexes must be consecutive and start at zero.'
    if (
      !isIsoTimestamp(sample.recorded_at) ||
      !Number.isFinite(sample.latitude) ||
      sample.latitude < -90 ||
      sample.latitude > 90 ||
      !Number.isFinite(sample.longitude) ||
      sample.longitude < -180 ||
      sample.longitude > 180 ||
      !Number.isFinite(sample.speed_kmh) ||
      sample.speed_kmh < 0 ||
      sample.speed_kmh > 500
    ) {
      return `Sample ${index} has invalid GPS data.`
    }
    const recordedAt = Date.parse(sample.recorded_at)
    if (recordedAt < previousTimestamp) return 'Samples must be in chronological order.'
    previousTimestamp = recordedAt
  }
  if (
    previousTimestamp < Date.parse(trip.started_at) ||
    Date.parse(samples[0].recorded_at) < Date.parse(trip.started_at) ||
    previousTimestamp > Date.parse(trip.ended_at)
  ) {
    return 'Trip timestamps must enclose all samples.'
  }

  return null
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return respond(res, 405, { error: 'Method not allowed.' })
  }

  const uploadToken = process.env.DEVICE_UPLOAD_TOKEN
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const ownerUserId = process.env.ESP32_OWNER_USER_ID
  if (
    !uploadToken ||
    uploadToken.length < 32 ||
    uploadToken.length > 128 ||
    !supabaseUrl ||
    !serviceRoleKey ||
    !UUID_PATTERN.test(ownerUserId ?? '')
  ) {
    return respond(res, 503, { error: 'Upload service is not configured.' })
  }
  if (!hasValidBearerToken(req.headers.authorization, uploadToken)) {
    return respond(res, 401, { error: 'Unauthorized device.' })
  }

  const contentLength = Number(req.headers['content-length'] ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return respond(res, 413, { error: 'Upload is too large.' })
  }

  let payload = req.body
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return respond(res, 400, { error: 'Request body must be valid JSON.' })
    }
  }
  if (Buffer.byteLength(JSON.stringify(payload ?? null), 'utf8') > MAX_BODY_BYTES) {
    return respond(res, 413, { error: 'Upload is too large.' })
  }

  const validationError = validatePayload(payload)
  if (validationError) return respond(res, 400, { error: validationError })

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let tripWriteError
  try {
    const result = await supabase.from('trips').upsert(
      {
        id: payload.trip.id,
        user_id: ownerUserId,
        name: payload.trip.name,
        started_at: payload.trip.started_at,
        ended_at: payload.trip.ended_at,
        laps: payload.trip.laps ?? [],
      },
      { onConflict: 'id', ignoreDuplicates: true },
    )
    tripWriteError = result.error
  } catch (error) {
    console.error('ESP trip metadata insert failed', error)
    return respond(res, 502, { error: 'Could not save trip metadata.' })
  }
  if (tripWriteError) {
    console.error('ESP trip metadata insert failed', tripWriteError.message)
    return respond(res, 502, { error: 'Could not save trip metadata.' })
  }

  let existingTrip
  try {
    const result = await supabase
      .from('trips')
      .select('user_id, name, started_at, ended_at, laps')
      .eq('id', payload.trip.id)
      .maybeSingle()
    if (result.error) {
      console.error('ESP trip ownership check failed', result.error.message)
      return respond(res, 502, { error: 'Could not verify trip ownership.' })
    }
    existingTrip = result.data
  } catch (error) {
    console.error('ESP trip ownership check failed', error)
    return respond(res, 502, { error: 'Could not verify trip ownership.' })
  }
  if (
    !existingTrip ||
    existingTrip.user_id !== ownerUserId ||
    existingTrip.name !== payload.trip.name ||
    Date.parse(existingTrip.started_at) !== Date.parse(payload.trip.started_at) ||
    Date.parse(existingTrip.ended_at) !== Date.parse(payload.trip.ended_at) ||
    JSON.stringify(existingTrip.laps ?? []) !== JSON.stringify(payload.trip.laps ?? [])
  ) {
    return respond(res, 409, { error: 'Trip id already belongs to a different trip.' })
  }

  const rows = payload.samples.map((sample) => ({
    trip_id: payload.trip.id,
    sample_index: sample.sample_index,
    recorded_at: sample.recorded_at,
    latitude: sample.latitude,
    longitude: sample.longitude,
    speed_kmh: sample.speed_kmh,
  }))
  let samplesError
  try {
    const result = await supabase
      .from('gps_samples')
      .upsert(rows, { onConflict: 'trip_id,sample_index' })
    samplesError = result.error
  } catch (error) {
    console.error('ESP GPS samples insert failed', error)
    return respond(res, 502, { error: 'Could not save GPS samples; retry the same trip to resume.' })
  }
  if (samplesError) {
    console.error('ESP GPS samples insert failed', samplesError.message)
    return respond(res, 502, { error: 'Could not save GPS samples; retry the same trip to resume.' })
  }

  return respond(res, 200, { ok: true, trip_id: payload.trip.id, samples: rows.length })
}
