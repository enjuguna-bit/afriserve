import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type Span,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ParentBasedSampler, TraceIdRatioBasedSampler } from "@opentelemetry/sdk-trace-base";
import { resolveDbQueryCategory } from "./metricsRegistry.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";
import type { LoggerLike, NextFunctionLike, RequestLike, ResponseLike } from "../types/runtime.js";

type InitializeTracingOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike | null;
  serviceName?: string;
};

type DbSpanOptions = {
  databaseSystem: "postgresql" | "sqlite";
  poolName?: string;
  sql: string;
};

type HeaderCarrier = Record<string, string | string[] | undefined>;

const tracingState: {
  enabled: boolean;
  sdk: NodeSDK | null;
} = {
  enabled: false,
  sdk: null,
};

const headerGetter = {
  keys(carrier: HeaderCarrier): string[] {
    return Object.keys(carrier);
  },
  get(carrier: HeaderCarrier, key: string): string | string[] | undefined {
    return carrier[key.toLowerCase()] ?? carrier[key];
  },
};

function normalizeEnvString(value: unknown): string {
  return String(value || "").trim();
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && typeof (value as PromiseLike<T>).then === "function";
}

function buildTracesEndpoint(baseUrl: string): string {
  if (/\/v1\/traces\/?$/i.test(baseUrl)) {
    return baseUrl;
  }
  return `${baseUrl.replace(/\/+$/, "")}/v1/traces`;
}

function getTracingExporterUrl(env: NodeJS.ProcessEnv = process.env): string {
  const tracesEndpoint = normalizeEnvString(env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
  if (tracesEndpoint) {
    return tracesEndpoint;
  }

  const baseEndpoint = normalizeEnvString(env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (!baseEndpoint) {
    return "";
  }

  return buildTracesEndpoint(baseEndpoint);
}

function getTracingSampleRatio(env: NodeJS.ProcessEnv = process.env): number {
  const configuredRatio = Number(normalizeEnvString(env.OTEL_TRACE_SAMPLE_RATIO));
  if (!Number.isFinite(configuredRatio)) {
    return 1;
  }
  return Math.min(Math.max(configuredRatio, 0), 1);
}

function getTracingServiceName(
  env: NodeJS.ProcessEnv = process.env,
  fallback = "afriserve-api",
): string {
  return normalizeEnvString(env.OTEL_SERVICE_NAME) || fallback;
}

function applySpanAttributes(span: Span, attributes: Record<string, unknown>): void {
  Object.entries(attributes).forEach(([key, value]) => {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      span.setAttribute(key, value);
    }
  });
}

function summarizeSqlStatement(sql: string): { operation: string; target: string; name: string } {
  const compactSql = String(sql || "").replace(/\s+/g, " ").trim();
  const operationMatch = compactSql.match(/^(select|insert|update|delete|with|alter|create|drop|begin|commit|rollback)\b/i);
  const operation = String(operationMatch?.[1] || "query").toUpperCase();
  const targetMatch = compactSql.match(/\b(from|into|update|table|join)\s+["`]?([a-zA-Z0-9_.]+)/i);
  const target = String(targetMatch?.[2] || "unknown").replace(/^public\./i, "");
  return {
    operation,
    target,
    name: target === "unknown" ? operation : `${operation} ${target}`,
  };
}

function finalizeSpanFromHttpResponse(span: Span, req: RequestLike, res: ResponseLike): void {
  const statusCode = Number(res.statusCode || 0);
  const routePath = req.route?.path || req.path || req.originalUrl || "unknown";
  const tenantId = typeof req.tenantId === "string" ? req.tenantId : getCurrentTenantId();

  applySpanAttributes(span, {
    "http.route": routePath,
    "http.response.status_code": statusCode,
    "app.request_id": req.requestId || null,
    "app.tenant_id": tenantId,
  });

  span.updateName(`${String(req.method || "GET").toUpperCase()} ${routePath}`);
  if (statusCode >= 500) {
    span.setStatus({ code: SpanStatusCode.ERROR });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
}

function recordErrorOnSpan(span: Span, error: unknown, attributes: Record<string, unknown> = {}): void {
  applySpanAttributes(span, attributes);
  if (error instanceof Error) {
    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });
    return;
  }

  const message = String(error || "unknown_error");
  span.recordException(new Error(message));
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message,
  });
}

async function initializeTracing(options: InitializeTracingOptions = {}): Promise<void> {
  if (tracingState.sdk) {
    return;
  }

  const env = options.env || process.env;
  const exporterUrl = getTracingExporterUrl(env);
  const sampleRatio = getTracingSampleRatio(env);

  if (!exporterUrl || sampleRatio <= 0) {
    tracingState.enabled = false;
    return;
  }

  const serviceName = getTracingServiceName(env, options.serviceName || "afriserve-api");
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({ url: exporterUrl }),
    sampler: new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(sampleRatio),
    }),
  });

  try {
    sdk.start();
    tracingState.sdk = sdk;
    tracingState.enabled = true;
    options.logger?.info?.("tracing.started", {
      exporterUrl,
      sampleRatio,
      serviceName,
    });
  } catch (error) {
    tracingState.sdk = null;
    tracingState.enabled = false;
    options.logger?.warn?.("tracing.start_failed", {
      error,
      exporterUrl,
      serviceName,
    });
  }
}

async function shutdownTracing(logger: LoggerLike | null = null): Promise<void> {
  const activeSdk = tracingState.sdk;
  tracingState.sdk = null;
  tracingState.enabled = false;

  if (!activeSdk) {
    return;
  }

  try {
    await activeSdk.shutdown();
    logger?.info?.("tracing.stopped");
  } catch (error) {
    logger?.warn?.("tracing.stop_failed", { error });
  }
}

function createHttpTracingMiddleware() {
  return (req: RequestLike, res: ResponseLike, next: NextFunctionLike): void => {
    if (!tracingState.enabled) {
      next();
      return;
    }

    const requestMethod = String(req.method || "GET").toUpperCase();
    const requestTarget = req.originalUrl || req.path || "/";
    const extractedContext = propagation.extract(ROOT_CONTEXT, req.headers || {}, headerGetter);
    const tracer = trace.getTracer("afriserve.http");
    const span = tracer.startSpan(
      `${requestMethod} ${requestTarget}`,
      {
        kind: SpanKind.SERVER,
      },
      extractedContext,
    );

    applySpanAttributes(span, {
      "http.request.method": requestMethod,
      "url.path": requestTarget,
      "client.address": req.ip || null,
      "app.request_id": req.requestId || null,
      "app.tenant_id": typeof req.tenantId === "string" ? req.tenantId : getCurrentTenantId(),
    });

    const traceContext = trace.setSpan(extractedContext, span);
    const traceId = span.spanContext().traceId;
    req.traceId = traceId;
    if (typeof res.setHeader === "function") {
      res.setHeader("X-Trace-Id", traceId);
    }

    let finalized = false;
    const finalize = (eventName: "finish" | "close") => {
      if (finalized) {
        return;
      }
      finalized = true;
      finalizeSpanFromHttpResponse(span, req, res);
      if (eventName === "close" && Number(res.statusCode || 0) < 400) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: "connection_closed" });
      }
      span.end();
    };

    res.on("finish", () => finalize("finish"));
    res.on("close", () => finalize("close"));

    context.with(traceContext, () => {
      next();
    });
  };
}

function recordExceptionOnActiveSpan(error: unknown, attributes: Record<string, unknown> = {}): void {
  if (!tracingState.enabled) {
    return;
  }

  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) {
    return;
  }

  recordErrorOnSpan(activeSpan, error, attributes);
}

function runWithDbSpan<T>(options: DbSpanOptions, work: () => T): T {
  if (!tracingState.enabled) {
    return work();
  }

  const tracer = trace.getTracer("afriserve.db");
  const category = resolveDbQueryCategory();
  const sqlSummary = summarizeSqlStatement(options.sql);
  const span = tracer.startSpan(
    sqlSummary.name,
    {
      kind: SpanKind.CLIENT,
    },
    context.active(),
  );

  applySpanAttributes(span, {
    "db.system": options.databaseSystem,
    "db.operation": sqlSummary.operation,
    "db.target": sqlSummary.target,
    "db.query.category": category,
    "db.pool.name": options.poolName || null,
    "app.tenant_id": getCurrentTenantId(),
  });

  const spanContext: Context = trace.setSpan(context.active(), span);

  try {
    const result = context.with(spanContext, work);
    if (isPromiseLike<T>(result)) {
      return Promise.resolve(result)
        .then((value) => {
          span.setStatus({ code: SpanStatusCode.OK });
          return value;
        })
        .catch((error: unknown) => {
          recordErrorOnSpan(span, error);
          throw error;
        })
        .finally(() => {
          span.end();
        }) as T;
    }

    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return result;
  } catch (error) {
    recordErrorOnSpan(span, error);
    span.end();
    throw error;
  }
}

export {
  createHttpTracingMiddleware,
  getTracingExporterUrl,
  getTracingSampleRatio,
  getTracingServiceName,
  initializeTracing,
  recordExceptionOnActiveSpan,
  runWithDbSpan,
  shutdownTracing,
};
