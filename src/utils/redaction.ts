function redactUrlPassword(value: string): string {
  return value.replace(
    /:\/\/([^:/?#@]+)(?::([^@/?#]*))?@/,
    (_match, username: string, password: string | undefined) => (
      typeof password === "string"
        ? `://${username}:<redacted>@`
        : `://${username}@`
    ),
  );
}

function redactDatabasePathForStatus(databasePath: string, databaseClient: string): string {
  const normalizedPath = String(databasePath || "").trim();
  if (!normalizedPath) {
    return normalizedPath;
  }

  if (String(databaseClient || "").trim().toLowerCase() !== "postgres") {
    return normalizedPath;
  }

  if (!/^postgres(?:ql)?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  return redactUrlPassword(normalizedPath);
}

export {
  redactDatabasePathForStatus,
};
