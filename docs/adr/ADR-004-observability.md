# ADR-004: Observability strategy

**Status:** Accepted  
**Date:** 2026-04-04  
**Deciders:** Engineering Team, Operations

## Context

AfriserveBackend handles financial workflows where operators need to answer four questions quickly:

1. What failed?
2. Which tenant, request, or background task was affected?
3. Where did the latency come from?
4. Which alert should have fired first?

The repository already had structured logs, Prometheus metrics, health endpoints, and optional Sentry/log shipping. The missing pieces were distributed tracing and checked-in alert rules.

## Decision

We standardize on three pillars in the repo itself:

- Structured JSON logs for operator-readable events
- Prometheus metrics and checked-in alert rules for service health
- OpenTelemetry traces for per-request and per-query diagnosis

## Implemented design

### Logging

- Request logs include request ID and trace ID when tracing is enabled.
- Error logs keep request context and continue sending exceptions to Sentry when configured.
- Sensitive payload previews remain redacted before logging.

### Metrics

Prometheus output continues to expose:

- HTTP request counts and average duration
- error totals
- background task runs, failures, and consecutive failures
- report-cache effectiveness
- DB query timing and DB pool saturation signals
- payment failure counters such as `microfinance_payment_failure_total{reason="b2c.core_failed"}`

### Tracing

OpenTelemetry tracing is enabled when either of these is configured:

- `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`
- `OTEL_EXPORTER_OTLP_ENDPOINT`

The implementation creates spans for:

- inbound HTTP requests
- database queries on both Postgres and SQLite
- unhandled request exceptions

Request spans carry request ID and tenant ID attributes so traces can be correlated back to logs and tenant-scoped incidents.

## Alerting

Checked-in Prometheus rules live in [`alerts/prometheus-rules.yml`](../../alerts/prometheus-rules.yml) and cover:

- B2C core payment failures
- primary DB pool exhaustion
- sustained DB acquire wait pressure
- repeated background task failures

## Consequences

### Positive

- Production latency spikes can now be followed from request span to DB span.
- Alert rules are versioned with the code that emits the metrics.
- Operators have a documented rollback and observability story during deploys.

### Trade-offs

- Tracing is opt-in and requires an OTLP collector endpoint.
- Without automatic instrumentation, new external integrations still need manual span coverage when they are added.

## Operational notes

- Use `OTEL_TRACE_SAMPLE_RATIO` to tune trace volume.
- Keep alert rules deployed alongside the application release.
- During incident review, correlate `requestId`, `traceId`, and Prometheus timestamps before diving into database logs.
