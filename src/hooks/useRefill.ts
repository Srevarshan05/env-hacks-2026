import { useCallback, useEffect, useRef, useState } from 'react'
import { getActiveRefill, getRefillSession, startRefill, type RefillSession } from '../services/apiService'
import { useAuth } from './useAuth'

const POLL_MS = 1_000
const POLL_LIMIT_MS = 3 * 60_000
const FINAL = ['approved', 'failed', 'cancelled', 'expired']

// Backend refill flow: POST /api/refill-sessions, then poll every second until a final status.
export function useRefill(machineId: string | null) {
  const auth = useAuth()
  const [session, setSession] = useState<RefillSession | null>(null)
  const [error, setError] = useState('')
  const [starting, setStarting] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const busy = useRef(false)

  const sessionId = session?.session_id ?? null
  const finished = session != null && FINAL.includes(session.status)
  const approved = session?.status === 'approved'
  const active = session != null && !finished && !timedOut

  // Resume a refill that was still running when the page was reloaded.
  useEffect(() => {
    if (auth.status !== 'signedIn' || !machineId) return
    const controller = new AbortController()
    getActiveRefill(controller.signal).then(({ session }) => { if (session?.machine_id === machineId) setSession(current => current ?? session) }).catch(() => {})
    return () => controller.abort()
  }, [auth.status, machineId])

  useEffect(() => {
    if (!sessionId || finished) return
    const controller = new AbortController()
    const startedAt = Date.now()
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > POLL_LIMIT_MS) { clearInterval(timer); setTimedOut(true); return }
      try { setSession(await getRefillSession(sessionId, controller.signal)) } catch (e) { if (!controller.signal.aborted) setError((e as Error).message) }
    }, POLL_MS)
    return () => { controller.abort(); clearInterval(timer) }
  }, [sessionId, finished])

  const start = useCallback(async () => {
    if (!machineId || busy.current) return
    busy.current = true; setStarting(true); setError(''); setTimedOut(false)
    try {
      setSession(await startRefill(machineId, crypto.randomUUID()))
    } catch (e) {
      setError((e as Error).message)
    } finally { busy.current = false; setStarting(false) }
  }, [machineId])

  return { start, session, approved, finished, active, starting, timedOut, error }
}
