// Configure the read API here once its routes are finalized.
// All VITE_ values are public. Device tokens and AWS secrets belong on the server.
export const apiConfig = {
  // VITE_API_URL is the backend's documented name; VITE_API_BASE_URL is the older alias.
  baseUrl: (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, ''),
  // Read-only sensor API (Lambda env-sensor-read-api over DynamoDB AirPurifierTelemetry); falls back to the main backend.
  sensorBaseUrl: (import.meta.env.VITE_SENSOR_API_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/$/, ''),
  useSampleData: (import.meta.env.VITE_USE_SAMPLE_DATA ?? import.meta.env.VITE_USE_DEMO_DATA) !== 'false',
  pollIntervalMs: 10_000,
  requestTimeoutMs: 8_000,
  staleAfterMs: 35_000,
  // When true, login calls POST /api/auth/session so the backend creates/loads the RDS user.
  profileSync: import.meta.env.VITE_PROFILE_SYNC === 'true',
  endpoints: {
    session: '/api/auth/session',
    profile: '/api/profile',
    points: (limit: number) => `/api/me/points?limit=${limit}`,
    rewards: '/api/rewards',
    redeem: (rewardId: string) => `/api/rewards/${encodeURIComponent(rewardId)}/redeem`,
    machine: (machineId: string) => `/api/machines/${encodeURIComponent(machineId)}`,
    refillSessions: '/api/refill-sessions',
    refillSession: (sessionId: string) => `/api/refill-sessions/${encodeURIComponent(sessionId)}`,
    activeRefill: '/api/refill-sessions/active',
    // Public sensor reads served by the backend from DynamoDB (see docs/sensor-readings-api.md).
    latest: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/readings/latest`,
    history: (nodeId: string) => `/api/nodes/${encodeURIComponent(nodeId)}/readings`,
  },
}
