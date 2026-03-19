export interface LoggerLike {
  level?: string;
  moduleLevelOverrides?: Map<string, string>;
  logShipperEnabled?: boolean;
  logShipperUrlSet?: boolean;
  debug?: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
  warn?: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
  child?: (moduleName: string) => LoggerLike;
  close?: () => Promise<void>;
}

export interface HttpMetricsPayload {
  method?: string;
  route?: string;
  statusCode?: number;
  durationMs?: number;
}

export interface ReportCacheMetricsPayload {
  event: "getOrSet" | "hit" | "miss" | "write" | "invalidation" | "clear" | "bypass" | "error";
}

export interface MetricsLike {
  observeHttpRequest?: (payload: HttpMetricsPayload) => void;
  observeError?: (statusCode?: number) => void;
  observeBackgroundTask?: (taskName: string, payload?: Record<string, unknown>) => void;
  observeDbQuery?: (payload: { category: string; durationMs: number }) => void;
  observeReportCache?: (payload: ReportCacheMetricsPayload) => void;
}

export interface ExpressLikeApp {
  disable(setting: string): void;
  set(setting: string, value: unknown): void;
  get(path: string, ...handlers: any[]): void;
  use(...args: any[]): void;
}

export interface SecurityMiddlewareOptions {
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
}

export interface RequestRouteLike {
  path?: string;
}

export interface RequestLike {
  method?: string;
  path?: string;
  originalUrl?: string;
  ip?: string;
  requestId?: string | null;
  route?: RequestRouteLike | null;
  headers?: Record<string, string | string[] | undefined>;
  [key: string]: unknown;
}

export interface ResponseLike {
  statusCode: number;
  on(eventName: string, listener: () => void): void;
  setHeader?: (name: string, value: string) => void;
  [key: string]: unknown;
}

export type NextFunctionLike = (error?: unknown) => void;

export type CorsOriginCallbackLike = (error: Error | null, allow?: boolean) => void;

export interface ZodErrorLike {
  issues: unknown[];
}

export interface ErrorHandlerOptions {
  ZodError: new (...args: any[]) => ZodErrorLike;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  errorTracker?: ErrorTrackerLike | null;
}

export interface HttpStatusErrorLike {
  status?: number;
  message?: string;
  [key: string]: unknown;
}

export interface ErrorTrackerLike {
  enabled?: boolean;
  provider?: string;
  captureException?: (error: unknown, context?: Record<string, unknown>) => void;
}
