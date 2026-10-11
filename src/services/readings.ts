import { apiConfig } from '../config/api'
import type { SensorReading } from '../types'

const sampleBootTime = Date.now() - (36 * 3_600 + 42 * 60) * 1000

export function sampleReading(nodeId: string, timestamp = Date.now()): SensorReading {
  const tick = Math.floor(timestamp / 10_000)
  const sequence = Math.max(0, Math.floor((tick * 10_000 - sampleBootTime) / 10_000))
  const t = tick / 6
  return {
    nodeId, readingId: `sample-${nodeId}-${tick}`, sequence,
    receivedAt: new Date(tick * 10_000).toISOString(),
    temperature: +(29.3 + Math.sin(t * 0.6) * 1.4 + Math.cos(t * 1.7) * 0.3).toFixed(1),
    humidity: +(67.2 + Math.sin(t * 0.4 + 2) * 4.6).toFixed(1),
    pressureHpa: +(1008.8 + Math.sin(t * 0.2) * 1.8).toFixed(1),
    gasResistanceOhms: Math.round(112_000 + Math.sin(t * 0.5) * 14_000 + Math.cos(t * 1.2) * 3_000),
    uptimeMs: Math.max(0, tick * 10_000 - sampleBootTime),
  }
}

export function sampleHistory(nodeId: string, durationMs: number): SensorReading[] {
  const end = Math.floor(Date.now() / 10_000) * 10_000
  const step = Math.max(10_000, Math.floor(durationMs / 180 / 10_000) * 10_000)
  const result: SensorReading[] = []
  for (let time = end - durationMs; time <= end; time += step) result.push(sampleReading(nodeId, time))
  return result
}

function isReading(value: unknown): value is SensorReading {
  if (!value || typeof value !== 'object') return false
  const r = value as Record<string, unknown>
  return ['nodeId', 'readingId', 'receivedAt'].every(k => typeof r[k] === 'string') &&
    Number.isFinite(Date.parse(r.receivedAt as string)) &&
    ['gasResistanceOhms', 'humidity', 'pressureHpa', 'sequence', 'temperature', 'uptimeMs'].every(k => typeof r[k] === 'number' && Number.isFinite(r[k]))
}

async function getJson(path: string, signal: AbortSignal): Promise<unknown> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (signal.aborted) controller.abort()
  signal.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, apiConfig.requestTimeoutMs)
  try {
    const response = await fetch(`${apiConfig.sensorBaseUrl}${path}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Read API returned ${response.status}.`)
    return await response.json()
  } finally {
    clearTimeout(timeout)
    signal.removeEventListener('abort', abort)
  }
}

export async function fetchReadings(nodeId: string, durationMs: number, signal: AbortSignal) {
  const since = new Date(Date.now() - durationMs).toISOString()
  const [latestPayload, historyPayload] = await Promise.all([
    getJson(apiConfig.endpoints.latest(nodeId), signal),
    getJson(`${apiConfig.endpoints.history(nodeId)}?since=${encodeURIComponent(since)}`, signal),
  ])
  const latest = latestPayload && typeof latestPayload === 'object' && 'reading' in latestPayload ? latestPayload.reading : latestPayload
  const history = historyPayload && typeof historyPayload === 'object' && 'readings' in historyPayload ? historyPayload.readings : historyPayload
  if (!isReading(latest) || latest.nodeId !== nodeId || !Array.isArray(history)) throw new Error('The API response does not match the sensor feed format.')
  if (!history.every(r => isReading(r) && r.nodeId === nodeId)) throw new Error('The history contains invalid readings.')
  const combined = [...history, latest]
  const unique = [...new Map(combined.map(r => [r.readingId, r])).values()]
  return { latest, history: unique.filter(r => Date.parse(r.receivedAt) >= Date.parse(since)).sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt)) }
}
