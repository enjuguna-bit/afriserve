function parseBooleanEnv(value: unknown, defaultValue = false): boolean {
  if (typeof value === "undefined" || value === null) {
    return defaultValue;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return defaultValue;
  }

  return ["1", "true", "yes", "on"].includes(normalized);
}

function getDefaultDbClient(env: NodeJS.ProcessEnv = process.env): "sqlite" | "postgres" {
  const isProduction = String(env.NODE_ENV || "").trim().toLowerCase() === "production";
  return isProduction ? "postgres" : "sqlite";
}

function getConfiguredDbClient(env: NodeJS.ProcessEnv = process.env): string {
  const defaultClient = getDefaultDbClient(env);
  return String(env.DB_CLIENT || defaultClient).trim().toLowerCase();
}

export {
  parseBooleanEnv,
  getDefaultDbClient,
  getConfiguredDbClient,
};
