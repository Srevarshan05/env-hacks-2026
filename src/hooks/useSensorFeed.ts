import { useCallback, useEffect, useState } from 'react'
import { apiConfig } from '../config/api'
import { sampleHistory, sampleReading, fetchReadings } from '../services/readings'
import type { SensorReading } from '../types'

export function useSensorFeed(nodeId: string, durationMs: number) {
  const [latest, setLatest] = useState<SensorReading | null>(null)
  const [history, setHistory] = useState<SensorReading[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshKey, setRefreshKey] = useState(0)
  const [now, setNow] = useState(Date.now())
  const refresh = useCallback(() => setRefreshKey(k => k + 1), [])

  useEffect(() => { setLatest(null); setHistory([]) }, [nodeId])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    let busy = false
    setLoading(true)
    setError(null)
    const update = async () => {
      if (busy) return
      busy = true
      try {
        const result = apiConfig.useSampleData
          ? { latest: sampleReading(nodeId), history: sampleHistory(nodeId, durationMs) }
          : await fetchReadings(nodeId, durationMs, controller.signal)
        if (active) { setLatest(result.latest); setHistory(result.history); setError(null) }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not reach the read API.')
      } finally {
        if (active) setLoading(false)
        busy = false
      }
    }
    void update()
    const interval = setInterval(() => void update(), apiConfig.pollIntervalMs)
    return () => { active = false; clearInterval(interval); controller.abort() }
  }, [nodeId, durationMs, refreshKey])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const age = latest ? Math.max(0, Math.floor((now - Date.parse(latest.receivedAt)) / 1000)) : null
  const status = apiConfig.useSampleData ? 'Sample feed' : !latest ? 'Unavailable' : error || (age ?? 0) > apiConfig.staleAfterMs / 1000 ? 'Offline' : 'Online'
  return { latest, history, error, loading, age, status, refresh, sample: apiConfig.useSampleData }
}
