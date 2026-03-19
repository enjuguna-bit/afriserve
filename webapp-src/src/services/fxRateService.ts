import type { LoggerLike } from "../types/runtime.js";

type FxRateServiceOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
  logger?: LoggerLike | null;
  providerUrl?: string | null;
  providerApiKey?: string | null;
  providerTimeoutMs?: number;
};

type ResolveRateOptions = {
  baseCurrency: string;
  quoteCurrency: string;
  asOf?: string | Date | null;
  allowRemoteFetch?: boolean;
};

function normalizeCurrency(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function toIsoDateTime(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  const asDate = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(asDate.getTime())) {
    return fallback;
  }
  return asDate.toISOString();
}

function createFxRateService(options: FxRateServiceOptions) {
  const {
    get,
    all,
    run,
    logger = null,
    providerUrl = process.env.FX_RATE_PROVIDER_URL || "https://api.exchangerate.host/convert",
    providerApiKey = process.env.FX_RATE_PROVIDER_API_KEY || "",
    providerTimeoutMs = 7000,
  } = options;

  async function listRates(params: {
    baseCurrency?: string | null;
    quoteCurrency?: string | null;
    limit?: number;
  } = {}) {
    const normalizedLimit = Math.max(1, Math.min(500, Math.floor(Number(params.limit || 100))));
    const filters: string[] = [];
    const queryParams: unknown[] = [];

    const baseCurrency = normalizeCurrency(params.baseCurrency);
    if (baseCurrency) {
      filters.push("base_currency = ?");
      queryParams.push(baseCurrency);
    }
    const quoteCurrency = normalizeCurrency(params.quoteCurrency);
    if (quoteCurrency) {
      filters.push("quote_currency = ?");
      queryParams.push(quoteCurrency);
    }

    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    queryParams.push(normalizedLimit);

    return all(
      `
        SELECT
          id,
          base_currency,
          quote_currency,
          rate,
          source,
          quoted_at,
          created_by_user_id,
          created_at
        FROM gl_fx_rates
        ${whereSql}
        ORDER BY datetime(quoted_at) DESC, id DESC
        LIMIT ?
      `,
      queryParams,
    );
  }

  async function upsertRate(payload: {
    baseCurrency: string;
    quoteCurrency: string;
    rate: number;
    source?: string | null;
    quotedAt?: string | Date | null;
    createdByUserId?: number | null;
  }) {
    const baseCurrency = normalizeCurrency(payload.baseCurrency);
    const quoteCurrency = normalizeCurrency(payload.quoteCurrency);
    const rate = Number(payload.rate);
    const source = String(payload.source || "manual").trim() || "manual";
    const quotedAt = toIsoDateTime(payload.quotedAt);
    const nowIso = new Date().toISOString();
    const createdByUserId = Number(payload.createdByUserId || 0) || null;

    if (!baseCurrency || !quoteCurrency) {
      throw new Error("Both base currency and quote currency are required");
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("FX rate must be a positive number");
    }

    await run(
      `
        INSERT INTO gl_fx_rates (
          base_currency,
          quote_currency,
          rate,
          source,
          quoted_at,
          created_by_user_id,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [baseCurrency, quoteCurrency, rate, source, quotedAt, createdByUserId, nowIso],
    );

    return {
      base_currency: baseCurrency,
      quote_currency: quoteCurrency,
      rate,
      source,
      quoted_at: quotedAt,
      created_by_user_id: createdByUserId,
      created_at: nowIso,
    };
  }

  async function lookupStoredRate(baseCurrency: string, quoteCurrency: string, asOfIso: string) {
    return get(
      `
        SELECT
          id,
          base_currency,
          quote_currency,
          rate,
          source,
          quoted_at,
          created_by_user_id,
          created_at
        FROM gl_fx_rates
        WHERE base_currency = ?
          AND quote_currency = ?
          AND datetime(quoted_at) <= datetime(?)
        ORDER BY datetime(quoted_at) DESC, id DESC
        LIMIT 1
      `,
      [baseCurrency, quoteCurrency, asOfIso],
    );
  }

  async function fetchRemoteRate(baseCurrency: string, quoteCurrency: string): Promise<number | null> {
    const normalizedProviderUrl = String(providerUrl || "").trim();
    if (!normalizedProviderUrl) {
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), providerTimeoutMs);

    try {
      const url = new URL(normalizedProviderUrl);
      url.searchParams.set("from", baseCurrency);
      url.searchParams.set("to", quoteCurrency);
      url.searchParams.set("amount", "1");
      if (providerApiKey) {
        url.searchParams.set("access_key", String(providerApiKey));
      }

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
      if (!response.ok) {
        return null;
      }

      const json = await response.json() as Record<string, any>;
      const candidateRate = Number(
        json?.info?.rate
          ?? json?.result
          ?? json?.rate
          ?? json?.rates?.[quoteCurrency],
      );
      if (!Number.isFinite(candidateRate) || candidateRate <= 0) {
        return null;
      }
      return candidateRate;
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("fx_rate.remote_fetch_failed", {
          baseCurrency,
          quoteCurrency,
          providerUrl: normalizedProviderUrl,
          error,
        });
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function resolveRate(options: ResolveRateOptions) {
    const baseCurrency = normalizeCurrency(options.baseCurrency);
    const quoteCurrency = normalizeCurrency(options.quoteCurrency);
    const asOfIso = toIsoDateTime(options.asOf);
    const allowRemoteFetch = options.allowRemoteFetch !== false;

    if (!baseCurrency || !quoteCurrency) {
      throw new Error("Both base currency and quote currency are required");
    }

    if (baseCurrency === quoteCurrency) {
      return {
        base_currency: baseCurrency,
        quote_currency: quoteCurrency,
        rate: 1,
        source: "parity",
        quoted_at: asOfIso,
      };
    }

    const stored = await lookupStoredRate(baseCurrency, quoteCurrency, asOfIso);
    if (stored && Number(stored.rate || 0) > 0) {
      const storedTimeMs = new Date(String(stored.quoted_at || asOfIso)).getTime();
      const asOfTimeMs = new Date(asOfIso).getTime();
      const ageMs = asOfTimeMs - storedTimeMs;
      
      if (ageMs <= 24 * 60 * 60 * 1000) {
        return {
          base_currency: String(stored.base_currency || baseCurrency),
          quote_currency: String(stored.quote_currency || quoteCurrency),
          rate: Number(stored.rate),
          source: String(stored.source || "stored"),
          quoted_at: String(stored.quoted_at || asOfIso),
        };
      }
    }

    if (!allowRemoteFetch) {
      throw new Error(`No stored FX rate found for ${baseCurrency}/${quoteCurrency}`);
    }

    const remoteRate = await fetchRemoteRate(baseCurrency, quoteCurrency);
    if (!remoteRate) {
      throw new Error(`No FX rate available for ${baseCurrency}/${quoteCurrency}`);
    }

    const inserted = await upsertRate({
      baseCurrency,
      quoteCurrency,
      rate: remoteRate,
      source: "remote",
      quotedAt: asOfIso,
      createdByUserId: null,
    });
    return {
      base_currency: inserted.base_currency,
      quote_currency: inserted.quote_currency,
      rate: inserted.rate,
      source: inserted.source,
      quoted_at: inserted.quoted_at,
    };
  }

  return {
    listRates,
    upsertRate,
    resolveRate,
  };
}

export {
  createFxRateService,
};
