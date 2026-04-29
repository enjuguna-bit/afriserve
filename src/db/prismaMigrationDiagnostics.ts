type FailedPrismaMigrationSummary = {
  migrationName: string;
  startedAt: string | null;
  appliedStepsCount: number;
  logSnippet: string | null;
};

function normalizeLogSnippet(logs: unknown): string | null {
  const normalized = String(logs ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const maxLength = 240;
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}...`
    : normalized;
}

function summarizeFailedPrismaMigrationRows(
  rows: Array<Record<string, unknown>>,
): FailedPrismaMigrationSummary[] {
  return rows.map((row) => ({
    migrationName: String(row.migration_name || "").trim() || "unknown",
    startedAt: row.started_at ? String(row.started_at) : null,
    appliedStepsCount: Number.isFinite(Number(row.applied_steps_count))
      ? Number(row.applied_steps_count)
      : 0,
    logSnippet: normalizeLogSnippet(row.logs),
  }));
}

export {
  summarizeFailedPrismaMigrationRows,
};
