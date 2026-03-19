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
