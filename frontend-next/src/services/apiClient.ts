import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { appConfig } from '../config/environment'
import { tokenManager } from './tokenManager'

// ── Tenant ID helpers ──────────────────────────────────────────────────────
// In multi-tenant mode, the active tenant is stored in localStorage so it
// survives page reloads. The value is injected into every API request via the
// X-Tenant-ID header, which the backend's tenantContext middleware reads to
// scope DB queries (and eventually enforce Postgres RLS policies).
const TENANT_ID_STORAGE_KEY = 'afriserve_tenant_id'
const TENANT_ID_DEFAULT = 'default'
const TENANT_ID_SAFE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

export function getActiveTenantId(): string {
  try {
    const raw = localStorage.getItem(TENANT_ID_STORAGE_KEY)
    if (raw && TENANT_ID_SAFE_PATTERN.test(raw)) {
      return raw
    }
  } catch {
    // localStorage unavailable (SSR, private mode, etc.) — fall back to default
  }
  return TENANT_ID_DEFAULT
}

export function setActiveTenantId(tenantId: string): void {
  if (!TENANT_ID_SAFE_PATTERN.test(tenantId)) {
    throw new Error(`Invalid tenant ID: "${tenantId}". Must match [a-zA-Z0-9_-]{1,64}.`)
  }
  try {
    localStorage.setItem(TENANT_ID_STORAGE_KEY, tenantId)
  } catch {
    // Best-effort: if localStorage is unavailable, the in-memory default is used
  }
}

export function clearActiveTenantId(): void {
  try {
    localStorage.removeItem(TENANT_ID_STORAGE_KEY)
  } catch {
    // Best-effort
  }
}

const apiTimeoutMsRaw = Number(import.meta.env.VITE_API_TIMEOUT_MS)
const apiTimeoutMs = Number.isFinite(apiTimeoutMsRaw) && apiTimeoutMsRaw > 0
  ? Math.floor(apiTimeoutMsRaw)
  : 15_000

export const apiClient = axios.create({
  baseURL: appConfig.apiUrl || '/api',
  timeout: apiTimeoutMs,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = tokenManager.getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  // Attach active tenant ID so the backend's tenantContext middleware can set
  // app.tenant_id on the Postgres connection for RLS enforcement.
  config.headers['X-Tenant-ID'] = getActiveTenantId()
  return config
})

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as {
      _retry?: boolean
      headers?: Record<string, string>
      [key: string]: unknown
    }
    const status = Number(error?.response?.status || 0)
    if (status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = tokenManager.getRefreshToken()
      if (refreshToken) {
        try {
          const refreshResponse = await axios.post(
            `${appConfig.apiUrl}/auth/refresh`,
            { token: refreshToken },
            { timeout: apiTimeoutMs },
          )

          const nextAccessToken = String(refreshResponse?.data?.token || '')
          const nextRefreshToken = String(refreshResponse?.data?.refreshToken || '')

          if (nextAccessToken) {
            tokenManager.setAccessToken(nextAccessToken)
            if (nextRefreshToken) {
              tokenManager.setRefreshToken(nextRefreshToken)
            }

            originalRequest.headers = {
              ...(originalRequest.headers || {}),
              Authorization: `Bearer ${nextAccessToken}`,
            }
            return apiClient(originalRequest)
          }
        } catch {
          // Fall through to standard unauthorized handling below.
        }
      }
    }

    if (status === 401) {
      useAuthStore.getState().clearSession()
      tokenManager.clearTokens()
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.assign('/login')
      }
    }
    return Promise.reject(error)
  },
)
