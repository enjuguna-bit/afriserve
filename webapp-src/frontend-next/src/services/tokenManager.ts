class SecureTokenManager {
  private readonly accessTokenKey = "__afriserve_token";
  private readonly refreshTokenKey = "__afriserve_refresh_token";

  setAccessToken(token: string) {
    sessionStorage.setItem(this.accessTokenKey, token);
  }

  getAccessToken(): string | null {
    return sessionStorage.getItem(this.accessTokenKey);
  }

  setRefreshToken(token: string) {
    sessionStorage.setItem(this.refreshTokenKey, token);
  }

  getRefreshToken(): string | null {
    return sessionStorage.getItem(this.refreshTokenKey);
  }

  clearTokens() {
    sessionStorage.removeItem(this.accessTokenKey);
    sessionStorage.removeItem(this.refreshTokenKey);
  }
}

const tokenManager = new SecureTokenManager();

export {
  tokenManager,
};
