export interface TrackPoint {
  latitude: number
  longitude: number
  timestamp: number
  speedKmh: number
}

function parseCsvRow(row: string): string[] {
  const values: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < row.length; index += 1) {
    const character = row[index]

    if (character === '"') {
      if (quoted && row[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }

  values.push(value.trim())
  return values
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseCsvTimestamp(dateValue: string, timeValue: string): number | null {
  const time = timeValue.trim()
  if (!time) return null

  const date = dateValue.trim()
  if (date && date.includes('-')) {
    const isoTimestamp = Date.parse(`${date}T${time.replace(/Z?$/, 'Z')}`)
    if (Number.isFinite(isoTimestamp)) return isoTimestamp
  }

  const timeMatch = time.match(/^(\d{2}):?(\d{2}):?(\d{2})(?:\.(\d+))?Z?$/i)
  if (!timeMatch) return null

  const fractions = Number(`0.${timeMatch[4] ?? '0'}`)
  const milliseconds = Math.round(fractions * 1000)
  let year = 2000
  let month = 1
  let day = 1
  const compactDate = date.match(/^(\d{2})(\d{2})(\d{2})$/)

  if (compactDate) {
    day = Number(compactDate[1])
    month = Number(compactDate[2])
    year = 2000 + Number(compactDate[3])
  } else if (date) {
    const parsedDate = Date.parse(date)
    if (!Number.isFinite(parsedDate)) return null
    const parsed = new Date(parsedDate)
    year = parsed.getUTCFullYear()
    month = parsed.getUTCMonth() + 1
    day = parsed.getUTCDate()
  }

  const timestamp = Date.UTC(
    year,
    month - 1,
    day,
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3]),
    milliseconds,
  )

  return Number.isFinite(timestamp) ? timestamp : null
}

function parseCsv(text: string): TrackPoint[] {
  const rows = text.split(/\r?\n/).filter((row) => row.trim().length > 0)
  if (rows.length < 2) throw new Error('CSV-filen skal indeholde en header og mindst én måling.')

  const headers = parseCsvRow(rows[0]).map(normalizeHeader)
  const indexOf = (...names: string[]) => headers.findIndex((header) => names.includes(header))
  const latitudeIndex = indexOf('latitude', 'lat')
  const longitudeIndex = indexOf('longitude', 'lon', 'lng', 'long')
  const speedIndex = indexOf('speedkmh', 'speed_kmh', 'speed')
  const timestampIndex = indexOf('timestamp', 'datetime', 'utc', 'utctimestamp')
  const dateIndex = indexOf('utcdate', 'date')
  const timeIndex = indexOf('utctime', 'time')

  if (latitudeIndex < 0 || longitudeIndex < 0) {
    throw new Error(
      'CSV-filen mangler GPS-koordinater. Den nuværende ESP32-CSV indeholder kun tid og fart; vi skal først tilføje latitude og longitude i firmwaren.',
    )
  }

  const points: TrackPoint[] = []
  for (const row of rows.slice(1)) {
    const values = parseCsvRow(row)
    const latitudeValue = values[latitudeIndex]?.trim() ?? ''
    const longitudeValue = values[longitudeIndex]?.trim() ?? ''
    const latitude = Number(latitudeValue)
    const longitude = Number(longitudeValue)
    const speedKmh = speedIndex >= 0 ? Number(values[speedIndex]) : 0
    const timestamp =
      timestampIndex >= 0
        ? Date.parse(values[timestampIndex])
        : parseCsvTimestamp(
            dateIndex >= 0 ? values[dateIndex] : '',
            timeIndex >= 0 ? values[timeIndex] : '',
          )

    if (
      !latitudeValue ||
      !longitudeValue ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(speedKmh) ||
      speedKmh < 0 ||
      timestamp === null ||
      !Number.isFinite(timestamp)
    ) {
      continue
    }

    points.push({ latitude, longitude, timestamp, speedKmh })
  }

  if (points.length < 2) {
    throw new Error('Der blev ikke fundet mindst to gyldige GPS-målinger i CSV-filen.')
  }

  return points.sort((first, second) => first.timestamp - second.timestamp)
}

function parseGpx(text: string): TrackPoint[] {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('GPX-filen er ikke gyldig XML.')

  const trackPoints = Array.from(document.getElementsByTagNameNS('*', 'trkpt'))
  const points = trackPoints.flatMap((element) => {
    const latitude = Number(element.getAttribute('lat'))
    const longitude = Number(element.getAttribute('lon'))
    const timestampText = element.getElementsByTagNameNS('*', 'time')[0]?.textContent
    const timestamp = timestampText ? Date.parse(timestampText) : Number.NaN
    const speedText = element.getElementsByTagNameNS('*', 'speed')[0]?.textContent?.trim()
    const hasSpeed = speedText !== undefined && speedText.length > 0
    const speedValue = hasSpeed ? Number(speedText) * 3.6 : 0

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(timestamp) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180 ||
      !Number.isFinite(speedValue) ||
      speedValue < 0
    ) {
      return []
    }

    return [{ latitude, longitude, timestamp, speedKmh: speedValue, hasSpeed }]
  })

  if (points.length < 2) {
    throw new Error('GPX-filen skal indeholde mindst to GPS-punkter med tidspunkt.')
  }

  for (let index = 0; index < points.length; index += 1) {
    if (points[index].hasSpeed || index === 0) continue
    const previous = points[index - 1]
    const elapsedSeconds = (points[index].timestamp - previous.timestamp) / 1000
    if (elapsedSeconds <= 0) continue

    const distanceMeters = distanceBetween(previous, points[index])
    points[index].speedKmh = (distanceMeters / elapsedSeconds) * 3.6
  }

  return points.map(({ hasSpeed: _hasSpeed, ...point }) => point)
}

function distanceBetween(first: TrackPoint, second: TrackPoint) {
  const radians = Math.PI / 180
  const latitudeDelta = (second.latitude - first.latitude) * radians
  const longitudeDelta = (second.longitude - first.longitude) * radians
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(first.latitude * radians) *
      Math.cos(second.latitude * radians) *
      Math.sin(longitudeDelta / 2) ** 2

  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function parseTrackFile(file: File): Promise<TrackPoint[]> {
  const contents = await file.text()
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension === 'gpx') return parseGpx(contents)
  if (extension === 'csv') return parseCsv(contents)
  throw new Error('Vælg en GPX- eller CSV-fil.')
}

export function demoTrack(): TrackPoint[] {
  const centerLatitude = 55.6761
  const centerLongitude = 12.5683
  const now = Date.now()

  return Array.from({ length: 180 }, (_, index) => {
    const progress = (index / 179) * Math.PI * 2
    const latitude =
      centerLatitude +
      Math.sin(progress) * 0.00145 +
      Math.sin(progress * 2) * 0.00028
    const longitude =
      centerLongitude +
      Math.cos(progress) * 0.00225 +
      Math.sin(progress * 3) * 0.00018
    const speedKmh = 34 + Math.sin(progress * 2.7) * 18 + Math.sin(progress * 6) * 4

    return {
      latitude,
      longitude,
      timestamp: now - (179 - index) * 200,
      speedKmh: Math.max(4, speedKmh),
    }
  })
}
