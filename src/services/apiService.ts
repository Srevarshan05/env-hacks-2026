import { apiConfig } from '../config/api'
import { getIdToken } from './authService'

export class ApiError extends Error {
  // `code` is the backend's `error` field, e.g. "insufficient_points", "machine_busy".
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); this.name = 'ApiError' }
}

type ApiInit = RequestInit & { auth?: boolean }

// Request to the backend. By default attaches the Cognito ID token as a Bearer token; pass auth: false for public routes.
export async function apiFetch<T>(path: string, { auth = true, ...init }: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (auth) {
    const token = await getIdToken()
    if (!token) throw new ApiError('You are not signed in.', 401)
    headers.set('Authorization', `Bearer ${token}`)
  }
  headers.set('Accept', 'application/json')
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (init.signal?.aborted) controller.abort()
  init.signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, apiConfig.requestTimeoutMs)
  try {
    const response = await fetch(`${apiConfig.baseUrl}${path}`, { ...init, headers, signal: controller.signal })
    if (!response.ok) {
      // Backend errors arrive as { "error": "code", "message": "..." }; request validation (422) uses FastAPI's { "detail": [...] }.
      const body = await response.json().catch(() => null) as { error?: unknown; message?: unknown; detail?: unknown } | null
      const message = typeof body?.message === 'string' ? body.message : typeof body?.detail === 'string' ? body.detail : `Server returned ${response.status}.`
      throw new ApiError(message, response.status, typeof body?.error === 'string' ? body.error : undefined)
    }
    return response.status === 204 ? undefined as T : await response.json() as T
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(controller.signal.aborted ? 'The server took too long to respond.' : 'Could not reach the server.', 0)
  } finally {
    clearTimeout(timeout)
    init.signal?.removeEventListener('abort', abort)
  }
}

// Shapes below follow the backend contract (real responses captured from the backend).
export type ApiUser = { id: string; full_name: string | null; email: string; role: string; created_at: string }
export type UserStats = { points: number; refills: number; liters: number; lifetime_points?: number }

// Call once right after Cognito sign-in: creates the RDS account on first call.
export const startSession = (machineId?: string) =>
  apiFetch<{ user: ApiUser; is_new_user: boolean; machine: (Machine & { status: string }) | null }>(apiConfig.endpoints.session, { method: 'POST', body: JSON.stringify(machineId ? { machine_id: machineId } : {}) })

export type Profile = { user: ApiUser; stats: Required<UserStats>; rank: number | null }
export const getProfile = (signal?: AbortSignal) => apiFetch<Profile>(apiConfig.endpoints.profile, { signal })

export type LedgerRow = {
  id: string; type: 'contribution_credit' | 'redemption_debit' | 'adjustment' | string; delta: number; reason: string; created_at: string
  liters: number | null; machine_id: string | null; machine_name: string | null; is_simulated: boolean | null
  reward_id: string | null; reward_title: string | null; redemption_id: string | null
}
export type PointsFeed = { balance: number; earned: number; spent: number; ledger: LedgerRow[] }
export const getPointsFeed = (limit = 50, signal?: AbortSignal) => apiFetch<PointsFeed>(apiConfig.endpoints.points(limit), { signal })

export type Reward = { id: string; title: string; description: string | null; points_cost: number; stock: number; active: boolean }
export const getRewards = (signal?: AbortSignal) => apiFetch<{ points: number; rewards: Reward[] }>(apiConfig.endpoints.rewards, { signal })
export type RedeemResult = { redemption_id: string; reward_id: string; reward_title: string; points_spent: number; status: string; created_at: string; balance: number; replayed: boolean }
export const redeemReward = (rewardId: string, idempotencyKey: string) =>
  apiFetch<RedeemResult>(apiConfig.endpoints.redeem(rewardId), { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } })

export type Machine = { machine_id: string; name: string; location: string; active: boolean; available?: boolean; latitude: number | null; longitude: number | null }
export const getMachine = (machineId: string, signal?: AbortSignal) => apiFetch<Machine>(apiConfig.endpoints.machine(machineId), { auth: false, signal })

export type RefillSession = {
  session_id: string; machine_id: string; machine_name: string
  status: 'created' | 'active' | 'measuring' | 'verifying' | 'approved' | 'failed' | 'cancelled' | 'expired' | string
  is_simulated: boolean; measured_liters: number; verified_liters: number | null; points_awarded: number; failure_reason: string | null
  created_at: string; finished_at: string | null
}
// Sends only machine_id: litres and points are decided by the backend.
export const startRefill = (machineId: string, idempotencyKey: string) =>
  apiFetch<RefillSession>(apiConfig.endpoints.refillSessions, { method: 'POST', body: JSON.stringify({ machine_id: machineId }), headers: { 'Idempotency-Key': idempotencyKey } })
export const getRefillSession = (sessionId: string, signal?: AbortSignal) => apiFetch<RefillSession>(apiConfig.endpoints.refillSession(sessionId), { signal })
export const getActiveRefill = (signal?: AbortSignal) => apiFetch<{ session: RefillSession | null }>(apiConfig.endpoints.activeRefill, { signal })
