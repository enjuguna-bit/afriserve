import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.basename(path.dirname(currentDir)) === "dist"
  ? path.resolve(currentDir, "..", "..")
  : path.resolve(currentDir, "..");

test("entrypoints initialize OpenTelemetry tracing before bootstrapping runtime services", () => {
  const serverSource = fs.readFileSync(path.join(repoRoot, "src", "server.ts"), "utf8");
  const workerSource = fs.readFileSync(path.join(repoRoot, "src", "worker.ts"), "utf8");

  assert.match(serverSource, /initializeTracing\(\{\s*serviceName:\s*"afriserve-api"/);
  assert.match(workerSource, /initializeTracing\(\{\s*serviceName:\s*"afriserve-queue-worker"/);
});

test("request and database paths are wrapped with tracing hooks", () => {
  const securitySource = fs.readFileSync(path.join(repoRoot, "src", "config", "security.ts"), "utf8");
  const postgresSource = fs.readFileSync(path.join(repoRoot, "src", "db", "postgresConnection.ts"), "utf8");
  const sqliteSource = fs.readFileSync(path.join(repoRoot, "src", "db", "sqliteConnection.ts"), "utf8");

  assert.match(securitySource, /app\.use\(createHttpTracingMiddleware\(\)\)/);
  assert.match(postgresSource, /runWithDbSpan\(/);
  assert.match(sqliteSource, /runWithDbSpan\(/);
});

test("shutdown paths flush tracing and error handling annotates active spans", () => {
  const lifecycleSource = fs.readFileSync(path.join(repoRoot, "src", "runtime", "lifecycle.ts"), "utf8");
  const queueWorkerSource = fs.readFileSync(path.join(repoRoot, "src", "runtime", "startQueueWorker.ts"), "utf8");
  const errorHandlerSource = fs.readFileSync(path.join(repoRoot, "src", "middleware", "errorHandler.ts"), "utf8");

  assert.match(lifecycleSource, /await shutdownTracing\(logger \|\| null\)/);
  assert.match(queueWorkerSource, /await shutdownTracing\(logger \|\| null\)/);
  assert.match(errorHandlerSource, /recordExceptionOnActiveSpan\(/);
});

test("tracing module exports OTLP-backed tracing with sample-ratio support", () => {
  const tracingSource = fs.readFileSync(path.join(repoRoot, "src", "observability", "tracing.ts"), "utf8");

  assert.match(tracingSource, /OTLPTraceExporter/);
  assert.match(tracingSource, /ParentBasedSampler/);
  assert.match(tracingSource, /TraceIdRatioBasedSampler/);
  assert.match(tracingSource, /OTEL_TRACE_SAMPLE_RATIO/);
  assert.match(tracingSource, /OTEL_EXPORTER_OTLP_ENDPOINT/);
});
