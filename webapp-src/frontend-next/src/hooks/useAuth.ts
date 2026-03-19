import { useAuthStore } from '../store/authStore'

export function useAuth() {
  const token = useAuthStore((state) => state.token)
  const user = useAuthStore((state) => state.user)
  const setSession = useAuthStore((state) => state.setSession)
  const clearSession = useAuthStore((state) => state.clearSession)

  return {
    isAuthenticated: Boolean(token),
    token,
    user,
    setSession,
    clearSession,
  }
}
