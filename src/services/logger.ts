import type { LogLevel, LoggerOptions } from "../types/observability.js";
import { getRequestScope } from "../observability/requestScope.js";

const levelWeight = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
} as const satisfies Record<LogLevel, number>;

function parseBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "y", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function safeSerialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    return value.map((entry) => safeSerialize(entry));
  }

  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      output[key] = safeSerialize(entry);
    });
    return output;
  }

  return value;
}

function isLogLevel(value: string): value is LogLevel {
  return Object.prototype.hasOwnProperty.call(levelWeight, value);
}

function parseModuleLevelOverrides(raw: string): Map<string, LogLevel> {
  const output = new Map<string, LogLevel>();
  String(raw || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const parts = entry.split("=").map((part) => String(part || "").trim());
      const moduleNameRaw = parts[0] ?? "";
      const levelRaw = parts[1] ?? "";
      const moduleName = moduleNameRaw.toLowerCase();
      const level = levelRaw.toLowerCase();
      if (moduleName && isLogLevel(level)) {
        output.set(moduleName, level);
      }
    });
  return output;
}

function createLogger(options: LoggerOptions = {}) {
  const configuredLevel = String(options.level || process.env.LOG_LEVEL || "info")
    .trim()
    .toLowerCase();
  const minimumLevel = isLogLevel(configuredLevel) ? configuredLevel : "info";
  const moduleLevelOverrides = parseModuleLevelOverrides(
    String(options.moduleLevelOverrides || process.env.LOG_LEVEL_MODULES || ""),
  );
  const logShipperUrl = String(process.env.LOG_SHIPPER_URL || "").trim();
  const logShipperToken = String(process.env.LOG_SHIPPER_AUTH_TOKEN || "").trim();
  const configuredShipperTimeoutMs = Number(process.env.LOG_SHIPPER_TIMEOUT_MS);
  const logShipperTimeoutMs = Number.isFinite(configuredShipperTimeoutMs) && configuredShipperTimeoutMs >= 100
    ? Math.floor(configuredShipperTimeoutMs)
    : 3000;
  const configuredShipperMinLevel = String(process.env.LOG_SHIPPER_MIN_LEVEL || "warn").trim().toLowerCase();
  const logShipperMinLevel: LogLevel = isLogLevel(configuredShipperMinLevel) ? configuredShipperMinLevel : "warn";
  const logShipperEnabled = parseBoolean(process.env.LOG_SHIPPER_ENABLED, true) && Boolean(logShipperUrl);
  const pendingShipperRequests = new Set<Promise<void>>();
  let lastShipperWarningAt = 0;

  function shipLog(payload: Record<string, unknown>, level: LogLevel): void {
    if (!logShipperEnabled || levelWeight[level] < levelWeight[logShipperMinLevel]) {
      return;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (logShipperToken) {
      headers.Authorization = `Bearer ${logShipperToken}`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, logShipperTimeoutMs);
    if (typeof timer.unref === "function") {
      timer.unref();
    }

    const request = fetch(logShipperUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`status_${response.status}`);
        }
      })
      .catch((error) => {
        const now = Date.now();
        if (now - lastShipperWarningAt < 30000) {
          return;
        }

        lastShipperWarningAt = now;
        const warningPayload = JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          message: "logger.shipper.failed",
          error: safeSerialize(error),
        });
        process.stderr.write(`${warningPayload}\n`);
      })
      .finally(() => {
        clearTimeout(timer);
      });

    pendingShipperRequests.add(request);
    request.finally(() => {
      pendingShipperRequests.delete(request);
    });
  }

  function resolveMinimumLevel(moduleName?: string): LogLevel {
    const normalized = String(moduleName || "").trim().toLowerCase();
    if (!normalized) {
      return minimumLevel;
    }
    return moduleLevelOverrides.get(normalized) || minimumLevel;
  }

  function shouldLog(level: LogLevel, moduleName?: string): boolean {
    const moduleMinimumLevel = resolveMinimumLevel(moduleName);
    return levelWeight[level] >= levelWeight[moduleMinimumLevel];
  }

  function emit(level: LogLevel, message: string, meta: Record<string, unknown> = {}, moduleName?: string): void {
    if (!shouldLog(level, moduleName)) {
      return;
    }

    const scope = getRequestScope();
    const normalizedModuleName = String(moduleName || "").trim() || undefined;
    const mergedMeta: Record<string, unknown> = {
      ...(meta || {}),
    };

    if (scope?.requestId && typeof mergedMeta.requestId === "undefined") {
      mergedMeta.requestId = scope.requestId;
    }
    if (normalizedModuleName && typeof mergedMeta.module === "undefined") {
      mergedMeta.module = normalizedModuleName;
    }

    const serializedMeta = safeSerialize(mergedMeta);
    const payload = {
      ts: new Date().toISOString(),
      level,
      message,
      ...(serializedMeta && typeof serializedMeta === "object" ? (serializedMeta as Record<string, unknown>) : {}),
    };
    const serialized = JSON.stringify(payload);
    if (level === "error" || level === "warn") {
      process.stderr.write(`${serialized}\n`);
    } else {
      process.stdout.write(`${serialized}\n`);
    }

    shipLog(payload, level);
  }

  return {
    level: minimumLevel,
    moduleLevelOverrides,
    logShipperEnabled,
    logShipperUrlSet: Boolean(logShipperUrl),
    debug(message: string, meta: Record<string, unknown> = {}) {
      emit("debug", message, meta);
    },
    info(message: string, meta: Record<string, unknown> = {}) {
      emit("info", message, meta);
    },
    warn(message: string, meta: Record<string, unknown> = {}) {
      emit("warn", message, meta);
    },
    error(message: string, meta: Record<string, unknown> = {}) {
      emit("error", message, meta);
    },
    child(moduleName: string) {
      const normalizedModuleName = String(moduleName || "").trim() || "app";
      return {
        level: resolveMinimumLevel(normalizedModuleName),
        logShipperEnabled,
        logShipperUrlSet: Boolean(logShipperUrl),
        debug(message: string, meta: Record<string, unknown> = {}) {
          emit("debug", message, meta, normalizedModuleName);
        },
        info(message: string, meta: Record<string, unknown> = {}) {
          emit("info", message, meta, normalizedModuleName);
        },
        warn(message: string, meta: Record<string, unknown> = {}) {
          emit("warn", message, meta, normalizedModuleName);
        },
        error(message: string, meta: Record<string, unknown> = {}) {
          emit("error", message, meta, normalizedModuleName);
        },
      };
    },
    async close() {
      await Promise.allSettled(Array.from(pendingShipperRequests));
    },
  };
}

export {
  createLogger,
};
