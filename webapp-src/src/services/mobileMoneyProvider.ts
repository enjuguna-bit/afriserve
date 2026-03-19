import crypto from "node:crypto";
import type { LoggerLike } from "../types/runtime.js";

function parseAmount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(2));
}

function normalizeOptionalText(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function toIsoDateFromMpesaTimestamp(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  if (/^\d{14}$/.test(raw)) {
    const year = Number(raw.slice(0, 4));
    const month = Number(raw.slice(4, 6));
    const day = Number(raw.slice(6, 8));
    const hour = Number(raw.slice(8, 10));
    const minute = Number(raw.slice(10, 12));
    const second = Number(raw.slice(12, 14));
    const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return fallback.toISOString();
  }

  return null;
}

interface C2BExtractedPayload {
  externalReceipt: string | null;
  amount: number;
  payerPhone: string | null;
  accountReference: string | null;
  paidAt: string | null;
}

function extractC2BPayload(payload: Record<string, any>): C2BExtractedPayload {
  return {
    externalReceipt: normalizeOptionalText(payload.TransID || payload.transId || payload.transactionId),
    amount: parseAmount(payload.TransAmount || payload.transAmount || payload.amount),
    payerPhone: normalizeOptionalText(payload.MSISDN || payload.msisdn || payload.phoneNumber),
    accountReference: normalizeOptionalText(payload.BillRefNumber || payload.billRefNumber || payload.accountReference),
    paidAt: toIsoDateFromMpesaTimestamp(payload.TransTime || payload.transTime || payload.paidAt),
  };
}

type CreateMobileMoneyProviderOptions = {
  env?: NodeJS.ProcessEnv;
  logger?: LoggerLike | null;
  fetchImpl?: (url: string, init?: Record<string, any>) => Promise<{
    ok: boolean;
    status: number;
    json?: () => Promise<any>;
    text?: () => Promise<string>;
  }>;
};

interface ParseC2BWebhookArgs {
  body: Record<string, any>;
}

interface B2CDisbursementArgs {
  amount: number;
  phoneNumber: string;
  accountReference: string;
  narration: string | null;
}

interface B2CDisbursementResult {
  providerRequestId: string;
  status: "accepted";
  raw: Record<string, any>;
}

interface ParseB2CCallbackArgs {
  body: Record<string, any>;
}

interface B2CCallbackPayload {
  providerRequestId: string | null;
  status: "completed" | "failed";
  failureReason: string | null;
  raw: Record<string, any>;
}

interface STKPushArgs {
  amount: number;
  phoneNumber: string;
  accountReference: string;
  transactionDesc: string | null;
}

interface STKPushResult {
  providerRequestId: string;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  status: "accepted";
  raw: Record<string, any>;
}

interface ParseSTKCallbackArgs {
  body: Record<string, any>;
}

interface STKCallbackPayload {
  providerRequestId: string | null;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  status: "completed" | "failed";
  resultCode: number | null;
  resultDesc: string | null;
  amount: number | null;
  externalReceipt: string | null;
  phoneNumber: string | null;
  paidAt: string | null;
  raw: Record<string, any>;
}

function normalizeUrlBase(value: unknown): string {
  const raw = String(value || "").trim();
  return raw.replace(/\/+$/, "");
}

function joinUrl(base: string, pathOrUrl: string): string {
  const trimmed = String(pathOrUrl || "").trim();
  if (!trimmed) {
    return base;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const baseWithoutSlash = normalizeUrlBase(base);
  const pathWithoutLeadingSlash = trimmed.replace(/^\/+/, "");
  return `${baseWithoutSlash}/${pathWithoutLeadingSlash}`;
}

function safeParseJson(value: unknown): Record<string, any> {
  if (value && typeof value === "object") {
    return value as Record<string, any>;
  }
  return {};
}

function extractDarajaErrorMessage(payload: Record<string, any>, fallback: string): string {
  return String(
    payload.errorMessage
    || payload.error_description
    || payload.errorCode
    || payload.ResponseDescription
    || payload.ResultDesc
    || fallback,
  ).trim() || fallback;
}

function toDarajaAmount(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.round(parsed);
}

function toDarajaTimestamp(date: Date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hour}${minute}${second}`;
}

function createMobileMoneyProvider(options: CreateMobileMoneyProviderOptions = {}) {
  const env = options.env || process.env;
  const logger = options.logger || null;
  const providerName = String(env.MOBILE_MONEY_PROVIDER || "mock").trim().toLowerCase() || "mock";
  const fetchImpl = options.fetchImpl || (typeof globalThis.fetch === "function"
    ? (globalThis.fetch.bind(globalThis) as CreateMobileMoneyProviderOptions["fetchImpl"])
    : null);

  const darajaBaseUrl = normalizeUrlBase(env.MOBILE_MONEY_DARAJA_BASE_URL || "https://sandbox.safaricom.co.ke");
  const darajaConsumerKey = String(env.MOBILE_MONEY_DARAJA_CONSUMER_KEY || "").trim();
  const darajaConsumerSecret = String(env.MOBILE_MONEY_DARAJA_CONSUMER_SECRET || "").trim();
  const darajaOauthPath = String(env.MOBILE_MONEY_DARAJA_OAUTH_PATH || "/oauth/v1/generate").trim() || "/oauth/v1/generate";
  const darajaB2CPaymentPath = String(env.MOBILE_MONEY_DARAJA_B2C_PAYMENT_PATH || "/mpesa/b2c/v1/paymentrequest").trim()
    || "/mpesa/b2c/v1/paymentrequest";
  const darajaB2CInitiatorName = String(env.MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME || "").trim();
  const darajaB2CSecurityCredential = String(env.MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL || "").trim();
  const darajaB2CShortCode = String(env.MOBILE_MONEY_DARAJA_B2C_SHORTCODE || "").trim();
  const darajaB2CCommandId = String(env.MOBILE_MONEY_DARAJA_B2C_COMMAND_ID || "BusinessPayment").trim() || "BusinessPayment";
  const darajaB2CResultUrl = String(env.MOBILE_MONEY_DARAJA_B2C_RESULT_URL || "").trim();
  const darajaB2CTimeoutUrl = String(env.MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL || "").trim();
  const darajaStkPushPath = String(env.MOBILE_MONEY_DARAJA_STK_PUSH_PATH || "/mpesa/stkpush/v1/processrequest").trim()
    || "/mpesa/stkpush/v1/processrequest";
  const darajaStkShortCode = String(env.MOBILE_MONEY_DARAJA_STK_SHORTCODE || "").trim() || "174379";
  const darajaStkPasskey = String(env.MOBILE_MONEY_DARAJA_STK_PASSKEY || "").trim();
  const darajaStkCallbackUrl = String(env.MOBILE_MONEY_DARAJA_STK_CALLBACK_URL || "").trim();
  const darajaStkTransactionType = String(env.MOBILE_MONEY_DARAJA_STK_TRANSACTION_TYPE || "CustomerPayBillOnline").trim()
    || "CustomerPayBillOnline";

  let darajaAccessTokenCache: {
    accessToken: string;
    expiresAtMs: number;
  } | null = null;

  async function readResponsePayload(response: {
    json?: () => Promise<any>;
    text?: () => Promise<string>;
  }): Promise<Record<string, any>> {
    if (response && typeof response.json === "function") {
      try {
        const parsed = await response.json();
        return safeParseJson(parsed);
      } catch (_error) {
      }
    }
    if (response && typeof response.text === "function") {
      try {
        const raw = await response.text();
        if (!raw) {
          return {};
        }
        return safeParseJson(JSON.parse(raw));
      } catch (_error) {
      }
    }
    return {};
  }

  function assertDarajaAuthConfig(): void {
    const missing: string[] = [];
    if (!darajaConsumerKey) {
      missing.push("MOBILE_MONEY_DARAJA_CONSUMER_KEY");
    }
    if (!darajaConsumerSecret) {
      missing.push("MOBILE_MONEY_DARAJA_CONSUMER_SECRET");
    }
    if (missing.length > 0) {
      throw new Error(`Missing required Daraja authentication configuration: ${missing.join(", ")}`);
    }
    if (!fetchImpl) {
      throw new Error("Global fetch is not available; cannot call Daraja API");
    }
  }

  function assertDarajaB2CConfig(): void {
    assertDarajaAuthConfig();
    const missing: string[] = [];
    if (!darajaB2CInitiatorName) {
      missing.push("MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME");
    }
    if (!darajaB2CSecurityCredential) {
      missing.push("MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL");
    }
    if (!darajaB2CShortCode) {
      missing.push("MOBILE_MONEY_DARAJA_B2C_SHORTCODE");
    }
    if (!darajaB2CResultUrl) {
      missing.push("MOBILE_MONEY_DARAJA_B2C_RESULT_URL");
    }
    if (!darajaB2CTimeoutUrl) {
      missing.push("MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL");
    }
    if (missing.length > 0) {
      throw new Error(`Missing required Daraja B2C configuration: ${missing.join(", ")}`);
    }
  }

  function assertDarajaStkConfig(): void {
    assertDarajaAuthConfig();
    const missing: string[] = [];
    if (!darajaStkShortCode) {
      missing.push("MOBILE_MONEY_DARAJA_STK_SHORTCODE");
    }
    if (!darajaStkPasskey) {
      missing.push("MOBILE_MONEY_DARAJA_STK_PASSKEY");
    }
    if (!darajaStkCallbackUrl) {
      missing.push("MOBILE_MONEY_DARAJA_STK_CALLBACK_URL");
    }
    if (missing.length > 0) {
      throw new Error(`Missing required Daraja STK configuration: ${missing.join(", ")}`);
    }
  }

  async function getDarajaAccessToken(): Promise<string> {
    assertDarajaAuthConfig();

    if (darajaAccessTokenCache && Date.now() < darajaAccessTokenCache.expiresAtMs) {
      return darajaAccessTokenCache.accessToken;
    }

    const oauthUrl = new URL(joinUrl(darajaBaseUrl, darajaOauthPath));
    if (!oauthUrl.searchParams.has("grant_type")) {
      oauthUrl.searchParams.set("grant_type", "client_credentials");
    }

    const basicAuth = Buffer.from(`${darajaConsumerKey}:${darajaConsumerSecret}`).toString("base64");
    const response = await fetchImpl!(oauthUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        Accept: "application/json",
      },
    });
    const payload = await readResponsePayload(response);

    if (!response.ok) {
      const message = extractDarajaErrorMessage(payload, `Daraja OAuth failed with status ${response.status}`);
      throw new Error(message);
    }

    const accessToken = String(payload.access_token || payload.accessToken || "").trim();
    if (!accessToken) {
      throw new Error("Daraja OAuth response missing access_token");
    }

    const expiresInRaw = Number(payload.expires_in || payload.expiresIn || 3599);
    const expiresInSeconds = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : 3599;
    const now = Date.now();
    darajaAccessTokenCache = {
      accessToken,
      expiresAtMs: now + Math.max(60, expiresInSeconds - 30) * 1000,
    };

    return accessToken;
  }

  async function postDarajaB2C(payload: Record<string, any>, accessToken: string): Promise<{
    response: {
      ok: boolean;
      status: number;
    };
    body: Record<string, any>;
  }> {
    const endpoint = joinUrl(darajaBaseUrl, darajaB2CPaymentPath);
    const response = await fetchImpl!(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readResponsePayload(response);
    return { response, body };
  }

  async function postDarajaStkPush(payload: Record<string, any>, accessToken: string): Promise<{
    response: {
      ok: boolean;
      status: number;
    };
    body: Record<string, any>;
  }> {
    const endpoint = joinUrl(darajaBaseUrl, darajaStkPushPath);
    const response = await fetchImpl!(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const body = await readResponsePayload(response);
    return { response, body };
  }

  async function initiateDarajaB2CDisbursement(args: B2CDisbursementArgs): Promise<B2CDisbursementResult> {
    assertDarajaB2CConfig();

    const amount = toDarajaAmount(Number(args.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Daraja B2C amount must be greater than zero");
    }

    const requestPayload = {
      InitiatorName: darajaB2CInitiatorName,
      SecurityCredential: darajaB2CSecurityCredential,
      CommandID: darajaB2CCommandId,
      Amount: amount,
      PartyA: darajaB2CShortCode,
      PartyB: String(args.phoneNumber || "").trim(),
      Remarks: String(args.narration || "Loan disbursement").trim() || "Loan disbursement",
      QueueTimeOutURL: darajaB2CTimeoutUrl,
      ResultURL: darajaB2CResultUrl,
      Occasion: String(args.accountReference || "").trim() || null,
    };

    if (!requestPayload.PartyB) {
      throw new Error("Daraja B2C phone number is required");
    }

    let accessToken = await getDarajaAccessToken();
    let call = await postDarajaB2C(requestPayload, accessToken);

    if (!call.response.ok && [401, 403].includes(Number(call.response.status || 0))) {
      darajaAccessTokenCache = null;
      accessToken = await getDarajaAccessToken();
      call = await postDarajaB2C(requestPayload, accessToken);
    }

    const responseCode = String(call.body.ResponseCode || call.body.responseCode || "").trim();
    const providerRequestId = normalizeOptionalText(
      call.body.ConversationID
      || call.body.conversationId
      || call.body.OriginatorConversationID
      || call.body.originatorConversationId,
    );

    if (!call.response.ok) {
      const message = extractDarajaErrorMessage(call.body, `Daraja B2C failed with status ${call.response.status}`);
      throw new Error(message);
    }

    if (responseCode && responseCode !== "0") {
      const message = extractDarajaErrorMessage(call.body, `Daraja B2C rejected with ResponseCode ${responseCode}`);
      throw new Error(message);
    }

    if (!providerRequestId) {
      throw new Error("Daraja B2C response missing ConversationID/OriginatorConversationID");
    }

    return {
      providerRequestId,
      status: "accepted",
      raw: {
        provider: providerName,
        requestPayload,
        response: call.body,
        httpStatus: call.response.status,
      },
    };
  }

  async function initiateDarajaStkPush(args: STKPushArgs): Promise<STKPushResult> {
    assertDarajaStkConfig();

    const amount = toDarajaAmount(Number(args.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Daraja STK amount must be greater than zero");
    }

    const phoneNumber = String(args.phoneNumber || "").trim();
    if (!phoneNumber) {
      throw new Error("Daraja STK phone number is required");
    }

    const timestamp = toDarajaTimestamp();
    const password = Buffer.from(`${darajaStkShortCode}${darajaStkPasskey}${timestamp}`).toString("base64");
    const requestPayload = {
      BusinessShortCode: darajaStkShortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: darajaStkTransactionType,
      Amount: amount,
      PartyA: phoneNumber,
      PartyB: darajaStkShortCode,
      PhoneNumber: phoneNumber,
      CallBackURL: darajaStkCallbackUrl,
      AccountReference: String(args.accountReference || "Afriserve").trim() || "Afriserve",
      TransactionDesc: String(args.transactionDesc || "Payment").trim() || "Payment",
    };

    let accessToken = await getDarajaAccessToken();
    let call = await postDarajaStkPush(requestPayload, accessToken);

    if (!call.response.ok && [401, 403].includes(Number(call.response.status || 0))) {
      darajaAccessTokenCache = null;
      accessToken = await getDarajaAccessToken();
      call = await postDarajaStkPush(requestPayload, accessToken);
    }

    const responseCode = String(call.body.ResponseCode || call.body.responseCode || "").trim();
    const checkoutRequestId = normalizeOptionalText(call.body.CheckoutRequestID || call.body.checkoutRequestId);
    const merchantRequestId = normalizeOptionalText(call.body.MerchantRequestID || call.body.merchantRequestId);
    const providerRequestId = checkoutRequestId || merchantRequestId;

    if (!call.response.ok) {
      const message = extractDarajaErrorMessage(call.body, `Daraja STK push failed with status ${call.response.status}`);
      throw new Error(message);
    }

    if (responseCode && responseCode !== "0") {
      const message = extractDarajaErrorMessage(call.body, `Daraja STK push rejected with ResponseCode ${responseCode}`);
      throw new Error(message);
    }

    if (!providerRequestId) {
      throw new Error("Daraja STK response missing CheckoutRequestID/MerchantRequestID");
    }

    return {
      providerRequestId,
      checkoutRequestId,
      merchantRequestId,
      status: "accepted",
      raw: {
        provider: providerName,
        requestPayload,
        response: call.body,
        httpStatus: call.response.status,
      },
    };
  }

  function parseStkCallbackPayload(args: ParseSTKCallbackArgs): STKCallbackPayload {
    const body = args.body || {};
    const stkCallback = body.Body?.stkCallback && typeof body.Body.stkCallback === "object"
      ? body.Body.stkCallback
      : body.stkCallback && typeof body.stkCallback === "object"
        ? body.stkCallback
        : body;

    const checkoutRequestId = normalizeOptionalText(
      stkCallback.CheckoutRequestID
      || stkCallback.checkoutRequestId
      || body.CheckoutRequestID
      || body.checkoutRequestId,
    );
    const merchantRequestId = normalizeOptionalText(
      stkCallback.MerchantRequestID
      || stkCallback.merchantRequestId
      || body.MerchantRequestID
      || body.merchantRequestId,
    );
    const resultCodeRaw = stkCallback.ResultCode ?? body.ResultCode ?? body.resultCode;
    const resultCode = Number.isFinite(Number(resultCodeRaw)) ? Number(resultCodeRaw) : null;
    const resultDesc = normalizeOptionalText(stkCallback.ResultDesc || body.ResultDesc || body.resultDesc);
    const status: "completed" | "failed" = resultCode === 0 ? "completed" : "failed";

    const metadataItems = Array.isArray(stkCallback.CallbackMetadata?.Item)
      ? stkCallback.CallbackMetadata.Item
      : Array.isArray(stkCallback.CallbackMetadata)
        ? stkCallback.CallbackMetadata
        : [];
    const metadata = metadataItems.reduce((acc: Record<string, any>, item: any) => {
      const key = String(item?.Name || "").trim();
      if (!key) {
        return acc;
      }
      acc[key] = item?.Value;
      return acc;
    }, {});

    const amountRaw = metadata.Amount ?? metadata.amount;
    const amount = Number.isFinite(Number(amountRaw)) ? Number(amountRaw) : null;
    const externalReceipt = normalizeOptionalText(metadata.MpesaReceiptNumber || metadata.mpesaReceiptNumber);
    const phoneNumber = normalizeOptionalText(metadata.PhoneNumber || metadata.phoneNumber);
    const paidAt = toIsoDateFromMpesaTimestamp(metadata.TransactionDate || metadata.transactionDate);

    return {
      providerRequestId: checkoutRequestId || merchantRequestId,
      checkoutRequestId,
      merchantRequestId,
      status,
      resultCode,
      resultDesc,
      amount,
      externalReceipt,
      phoneNumber,
      paidAt,
      raw: body,
    };
  }

  return {
    providerName,
    parseC2BWebhook(args: ParseC2BWebhookArgs): C2BExtractedPayload {
      const body = args.body || {};
      return extractC2BPayload(body);
    },
    async initiateB2CDisbursement(args: B2CDisbursementArgs): Promise<B2CDisbursementResult> {
      if (providerName === "daraja") {
        return initiateDarajaB2CDisbursement(args);
      }

      if (providerName !== "mock") {
        if (logger && typeof logger.warn === "function") {
          logger.warn("mobile_money.provider.not_implemented", {
            provider: providerName,
          });
        }
        throw new Error(`MOBILE_MONEY_PROVIDER "${providerName}" is not implemented yet`);
      }

      const requestId = `mock-b2c-${crypto.randomUUID()}`;
      return {
        providerRequestId: requestId,
        status: "accepted",
        raw: {
          provider: providerName,
          requestId,
          amount: Number(args.amount || 0),
          phoneNumber: args.phoneNumber,
          accountReference: args.accountReference,
          narration: args.narration || null,
        },
      };
    },
    async initiateSTKPush(args: STKPushArgs): Promise<STKPushResult> {
      if (providerName === "daraja") {
        return initiateDarajaStkPush(args);
      }

      if (providerName !== "mock") {
        if (logger && typeof logger.warn === "function") {
          logger.warn("mobile_money.provider.not_implemented", {
            provider: providerName,
          });
        }
        throw new Error(`MOBILE_MONEY_PROVIDER "${providerName}" is not implemented yet`);
      }

      const checkoutRequestId = `mock-stk-${crypto.randomUUID()}`;
      return {
        providerRequestId: checkoutRequestId,
        checkoutRequestId,
        merchantRequestId: `mock-merchant-${crypto.randomUUID()}`,
        status: "accepted",
        raw: {
          provider: providerName,
          checkoutRequestId,
          amount: Number(args.amount || 0),
          phoneNumber: args.phoneNumber,
          accountReference: args.accountReference,
          transactionDesc: args.transactionDesc || null,
        },
      };
    },
    parseSTKCallback(args: ParseSTKCallbackArgs): STKCallbackPayload {
      return parseStkCallbackPayload(args);
    },
    parseB2CCallback(args: ParseB2CCallbackArgs): B2CCallbackPayload {
      const body = args.body || {};

      const resultBlock = body.Result && typeof body.Result === "object"
        ? body.Result
        : body.result && typeof body.result === "object"
          ? body.result
          : null;

      const providerRequestId = normalizeOptionalText(
        body.providerRequestId
        || body.provider_request_id
        || body.ConversationID
        || body.conversationId
        || resultBlock?.ConversationID
        || resultBlock?.OriginatorConversationID,
      );

      const resultCodeRaw = resultBlock?.ResultCode ?? body.resultCode ?? body.ResultCode;
      const resultCode = Number(resultCodeRaw);
      const explicitStatus = String(body.status || resultBlock?.ResultDesc || "").trim().toLowerCase();

      const isSuccessFromStatus = ["completed", "success", "succeeded", "ok"].includes(explicitStatus);
      const isFailureFromStatus = ["failed", "failure", "error", "timeout", "cancelled"].includes(explicitStatus);
      const isSuccessFromCode = Number.isFinite(resultCode) && resultCode === 0;

      const status: "completed" | "failed" = (isSuccessFromStatus || isSuccessFromCode) && !isFailureFromStatus
        ? "completed"
        : "failed";

      const failureReason = status === "failed"
        ? normalizeOptionalText(
          body.failureReason
          || body.resultDesc
          || resultBlock?.ResultDesc
          || resultBlock?.ResultDescription
          || "B2C callback reported failure",
        )
        : null;

      return {
        providerRequestId,
        status,
        failureReason,
        raw: body,
      };
    },
  };
}

export {
  createMobileMoneyProvider,
};
