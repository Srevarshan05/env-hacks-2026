import { useSyncExternalStore } from 'react'
import { getAuthState, subscribeAuth } from '../services/authService'

export function useAuth() { return useSyncExternalStore(subscribeAuth, getAuthState) }
