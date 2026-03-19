function escapeLabelValue(value: unknown): string {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"");
}

function toMetricName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "unknown";
}

function createGaugeLine(name: string, value: unknown, labels: Record<string, unknown> = {}): string {
  const numeric = Number(value || 0);
  const normalized = Number.isFinite(numeric) ? numeric : 0;
  const entries = Object.entries(labels).filter(([, labelValue]) => typeof labelValue !== "undefined");
  if (entries.length === 0) {
    return `${name} ${normalized}`;
  }

  const labelSql = entries
    .map(([key, labelValue]) => `${toMetricName(key)}="${escapeLabelValue(labelValue)}"`)
    .join(",");
  return `${name}{${labelSql}} ${normalized}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildPrometheusMetrics(snapshot: Record<string, unknown>): string {
  const lines: string[] = [];
  const http = asRecord(snapshot?.http);
  const errors = asRecord(snapshot?.errors);
  const backgroundTasks = asRecord(snapshot?.backgroundTasks);
  const reportCache = asRecord(snapshot?.reportCache);

  lines.push("# TYPE microfinance_http_requests_total counter");
  lines.push(createGaugeLine("microfinance_http_requests_total", http.requestsTotal));
  lines.push("# TYPE microfinance_http_request_duration_avg_milliseconds gauge");
  lines.push(createGaugeLine("microfinance_http_request_duration_avg_milliseconds", http.avgDurationMs));

  const byMethod = asRecord(http.byMethod);
  Object.entries(byMethod).forEach(([method, total]) => {
    lines.push(createGaugeLine("microfinance_http_requests_by_method_total", total, { method }));
  });

  const byStatusClass = asRecord(http.byStatusClass);
  Object.entries(byStatusClass).forEach(([statusClass, total]) => {
    lines.push(createGaugeLine("microfinance_http_requests_by_status_class_total", total, { statusClass }));
  });

  lines.push("# TYPE microfinance_errors_total counter");
  lines.push(createGaugeLine("microfinance_errors_total", errors.total));
  const errorByStatus = asRecord(errors.byStatus);
  Object.entries(errorByStatus).forEach(([status, total]) => {
    lines.push(createGaugeLine("microfinance_errors_by_status_total", total, { status }));
  });

  const backgroundTaskEntries = Object.entries(backgroundTasks);
  backgroundTaskEntries.forEach(([taskName, taskSnapshot]) => {
    const snapshotPayload = asRecord(taskSnapshot);
    lines.push(createGaugeLine("microfinance_background_task_runs_total", snapshotPayload.runs, { task: taskName }));
    lines.push(createGaugeLine("microfinance_background_task_failures_total", snapshotPayload.failures, { task: taskName }));
    lines.push(createGaugeLine(
      "microfinance_background_task_consecutive_failures",
      snapshotPayload.consecutiveFailures,
      { task: taskName },
    ));
    lines.push(createGaugeLine(
      "microfinance_background_task_last_duration_milliseconds",
      snapshotPayload.lastDurationMs,
      { task: taskName },
    ));
    lines.push(createGaugeLine(
      "microfinance_background_task_degraded",
      toNumber(snapshotPayload.degraded ? 1 : 0),
      { task: taskName },
    ));
  });

  lines.push("# TYPE microfinance_report_cache_get_or_set_total counter");
  lines.push(createGaugeLine("microfinance_report_cache_get_or_set_total", reportCache.getOrSetCalls));
  lines.push(createGaugeLine("microfinance_report_cache_hits_total", reportCache.hits));
  lines.push(createGaugeLine("microfinance_report_cache_misses_total", reportCache.misses));
  lines.push(createGaugeLine("microfinance_report_cache_writes_total", reportCache.writes));
  lines.push(createGaugeLine("microfinance_report_cache_invalidations_total", reportCache.invalidations));
  lines.push(createGaugeLine("microfinance_report_cache_clears_total", reportCache.clears));
  lines.push(createGaugeLine("microfinance_report_cache_bypasses_total", reportCache.bypasses));
  lines.push(createGaugeLine("microfinance_report_cache_errors_total", reportCache.errors));
  const reportCacheRatios = asRecord(reportCache.ratios);
  lines.push(createGaugeLine("microfinance_report_cache_hit_rate_percent", reportCacheRatios.hitRatePercent));
  lines.push(createGaugeLine("microfinance_report_cache_miss_rate_percent", reportCacheRatios.missRatePercent));

  const dbQueries = asRecord(snapshot?.dbQueries);
  const dbQueryEntries = Object.entries(dbQueries);
  if (dbQueryEntries.length > 0) {
    lines.push("# TYPE microfinance_db_query_count_total counter");
    lines.push("# TYPE microfinance_db_query_duration_total_milliseconds counter");
    lines.push("# TYPE microfinance_db_query_duration_avg_milliseconds gauge");
    lines.push("# TYPE microfinance_db_query_duration_max_milliseconds gauge");
    dbQueryEntries.forEach(([category, stats]) => {
      const queryStats = asRecord(stats);
      lines.push(createGaugeLine("microfinance_db_query_count_total", queryStats.count, { category }));
      lines.push(createGaugeLine("microfinance_db_query_duration_total_milliseconds", queryStats.totalMs, { category }));
      lines.push(createGaugeLine("microfinance_db_query_duration_avg_milliseconds", queryStats.avgMs, { category }));
      lines.push(createGaugeLine("microfinance_db_query_duration_max_milliseconds", queryStats.maxMs, { category }));
    });
  }

  return `${lines.join("\n")}\n`;
}

export {
  buildPrometheusMetrics,
};
