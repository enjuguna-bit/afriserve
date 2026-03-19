import { create } from 'zustand'
import type { AuthUser } from '../types/auth'
import { clearActiveTenantId } from '../services/apiClient'
import { tokenManager } from '../services/tokenManager'

type AuthState = {
  token: string | null
  user: AuthUser | null
  setUser: (user: AuthUser) => void
  setSession: (token: string, user: AuthUser, refreshToken?: string) => void
  clearSession: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: tokenManager.getAccessToken(),
  user: null,
  setUser: (user) => set({ user }),
  setSession: (token, user, refreshToken) => {
    tokenManager.setAccessToken(token)
    if (refreshToken) {
      tokenManager.setRefreshToken(refreshToken)
    }
    set({ token, user })
  },
  clearSession: () => {
    tokenManager.clearTokens()
    // Clear the stored tenant ID so the next login starts from 'default',
    // preventing a previous admin session's tenant from leaking into a new one.
    clearActiveTenantId()
    set({ token: null, user: null })
  },
}))
