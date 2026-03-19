import { apiClient } from './apiClient'
import { tokenManager } from './tokenManager'
import type { AuthUser, LoginRequest, LoginResponse } from '../types/auth'

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', payload)
  return data
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me')
  return data
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }) {
  const { data } = await apiClient.post<{ message: string }>('/auth/change-password', payload)
  return data
}

export async function logout() {
  const refreshToken = tokenManager.getRefreshToken()
  const payload = refreshToken ? { refreshToken } : {}
  const { data } = await apiClient.post<{ message: string }>('/auth/logout', payload)
  return data
}
