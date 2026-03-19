type AppEnvironment = "development" | "staging" | "production";

type AppConfig = {
  apiUrl: string;
  env: AppEnvironment;
  sentryDsn: string;
  gaId: string;
  logLevel: "debug" | "info" | "warn" | "error";
};

const REQUIRED_ENV_VARS = ["VITE_API_BASE_URL", "VITE_APP_ENV"] as const;

function getEnvValue(key: string): string {
  const value = import.meta.env[key] as string | undefined;
  return String(value || "").trim();
}

function validateEnvironment(): AppConfig {
  const missing = REQUIRED_ENV_VARS.filter((key) => !getEnvValue(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  const envValue = getEnvValue("VITE_APP_ENV").toLowerCase();
  const env: AppEnvironment = envValue === "production"
    ? "production"
    : envValue === "staging"
      ? "staging"
      : "development";

  const logLevelValue = getEnvValue("VITE_LOG_LEVEL").toLowerCase();
  const logLevel: AppConfig["logLevel"] = ["debug", "info", "warn", "error"].includes(logLevelValue)
    ? (logLevelValue as AppConfig["logLevel"])
    : "warn";

  return {
    apiUrl: getEnvValue("VITE_API_BASE_URL"),
    env,
    sentryDsn: getEnvValue("VITE_SENTRY_DSN"),
    gaId: getEnvValue("VITE_GA_ID"),
    logLevel,
  };
}

const appConfig = validateEnvironment();

export {
  appConfig,
};
