class SecureTokenManager {
  private readonly accessTokenKey = '__afriserve_access_token'
  private readonly refreshTokenKey = '__afriserve_refresh_token'

  // In-memory fallback for environments where sessionStorage is unavailable
  // (SSR, private-browsing with strict storage blocking, certain WebViews).
  private memoryAccessToken: string | null = null
  private memoryRefreshToken: string | null = null

  setAccessToken(token: string) {
    this.memoryAccessToken = token
    try { sessionStorage.setItem(this.accessTokenKey, token) } catch { /* storage blocked */ }
  }

  getAccessToken(): string | null {
    if (this.memoryAccessToken) return this.memoryAccessToken
    try { return sessionStorage.getItem(this.accessTokenKey) } catch { return null }
  }

  setRefreshToken(token: string) {
    this.memoryRefreshToken = token
    try { sessionStorage.setItem(this.refreshTokenKey, token) } catch { /* storage blocked */ }
  }

  getRefreshToken(): string | null {
    if (this.memoryRefreshToken) return this.memoryRefreshToken
    try { return sessionStorage.getItem(this.refreshTokenKey) } catch { return null }
  }

  clearTokens() {
    this.memoryAccessToken = null
    this.memoryRefreshToken = null
    try {
      sessionStorage.removeItem(this.accessTokenKey)
      sessionStorage.removeItem(this.refreshTokenKey)
    } catch { /* storage blocked */ }
  }
}

const tokenManager = new SecureTokenManager()

export { tokenManager }
