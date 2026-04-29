type JwtSecretConfig = {
  activeSecret: string;
  validSecrets: string[];
};

function resolveJwtSecretConfig(jwtSecret: unknown, jwtSecrets: unknown[] = []): JwtSecretConfig {
  const validSecrets = [
    ...new Set(
      [
        String(jwtSecret || "").trim(),
        ...(Array.isArray(jwtSecrets) ? jwtSecrets : []),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  ];

  if (validSecrets.length === 0) {
    throw new Error("JWT secret configuration is required. Set JWT_SECRET or JWT_SECRETS before starting the server.");
  }

  // Enforce minimum secret length — short secrets are trivially brute-forceable.
  // NIST SP 800-131A recommends ≥256-bit (32-byte) symmetric keys.
  const weakSecrets = validSecrets.filter((s) => s.length < 32);
  if (weakSecrets.length > 0) {
    const nodeEnv = String(process.env.NODE_ENV || "").trim().toLowerCase();
    const msg = `JWT_SECRET must be at least 32 characters (found ${weakSecrets.length} short secret(s)). Generate a strong secret with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`;
    if (nodeEnv === "production") {
      throw new Error(msg);
    } else {
      // Warn loudly in dev/test but don't block startup
      process.stderr.write(JSON.stringify({ level: "warn", message: "jwt.weak_secret", detail: msg }) + "\n");
    }
  }

  return {
    activeSecret: validSecrets[0]!,
    validSecrets,
  };
}

export {
  resolveJwtSecretConfig,
};

export type {
  JwtSecretConfig,
};
