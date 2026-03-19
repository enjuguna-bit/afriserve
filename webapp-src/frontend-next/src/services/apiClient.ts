import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { appConfig } from '../config/environment'
import { tokenManager } from './tokenManager'

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
