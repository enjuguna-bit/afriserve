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

export {
  parseBooleanEnv,
};
