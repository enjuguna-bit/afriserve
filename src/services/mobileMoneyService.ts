import crypto from "node:crypto";
import { prisma, type PrismaTransactionClient } from "../db/prismaClient.js";
import { createMobileMoneyReadRepository } from "../repositories/mobileMoneyReadRepository.js";
import { CircuitBreakerOpenError, CircuitBreakerTimeoutError, createCircuitBreaker } from "./circuitBreaker.js";
import {
  DomainValidationError,
  LoanNotFoundError,
  ServiceUnavailableDomainError,
  UnauthorizedDomainError,
  UpstreamServiceError,
} from "../domain/errors.js";

interface RepaymentResultLike {
  repayment: Record<string, any> | null;
  loan: Record<string, any> | null;
}

interface C2BEventRowLike {
  id: unknown;
  provider: unknown;
  external_receipt: unknown;
  account_reference: unknown;
  payer_phone: unknown;
  amount: unknown;
  paid_at: unknown;
  status: unknown;
  loan_id: unknown;
  repayment_id: unknown;
  reconciliation_note: unknown;
  reconciled_at: unknown;
  created_at: unknown;
}

interface MobileMoneyServiceDeps {
  run: (sql: string, params?: unknown[]) => Promise<any>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  repaymentService: {
    recordRepayment: (options: {
      loanId: number;
      payload: { amount: number; note?: string };
      user?: { sub?: number | null };
      ipAddress: string | null | undefined;
      skipScopeCheck?: boolean;
      source?: {
        channel: string;
        provider: string;
        externalReceipt?: string | null;
        externalReference?: string | null;
        payerPhone?: string | null;
      };
      transactionClient?: PrismaTransactionClient;
    }) => Promise<RepaymentResultLike>;
  };
  loanLifecycleService: {
    disburseLoan: (options: {
      loanId: number;
      payload: { notes?: string; amount?: number; finalDisbursement?: boolean };
      user: { sub: number };
      ipAddress: string | null | undefined;
    }) => Promise<Record<string, any>>;
  };
  mobileMoneyProvider: {
    providerName: string;
    parseC2BWebhook: (args: { body: Record<string, any> }) => {
      externalReceipt: string | null;
      amount: number;
      payerPhone: string | null;
      accountReference: string | null;
      paidAt: string | null;
    };
    initiateB2CDisbursement: (args: {
      amount: number;
      phoneNumber: string;
      accountReference: string;
      narration: string | null;
    }) => Promise<{
      providerRequestId: string;
      status: string;
      raw: Record<string, any>;
    }>;
    parseB2CCallback?: (args: { body: Record<string, any> }) => {
      providerRequestId: string | null;
      status: "completed" | "failed";
      failureReason: string | null;
      raw: Record<string, any>;
    };
    initiateSTKPush?: (args: {
      amount: number;
      phoneNumber: string;
      accountReference: string;
      transactionDesc: string | null;
    }) => Promise<{
      providerRequestId: string;
      checkoutRequestId: string | null;
      merchantRequestId: string | null;
      status: string;
      raw: Record<string, any>;
    }>;
    parseSTKCallback?: (args: { body: Record<string, any> }) => {
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
    };
  };
  c2bEnabled?: boolean;
  b2cEnabled?: boolean;
  stkEnabled?: boolean;
  webhookToken?: string;
  providerTimeoutMs?: number;
  circuitFailureThreshold?: number;
  circuitResetTimeoutMs?: number;
  logger?: { info?: (message: string, meta?: Record<string, unknown>) => void; warn?: (message: string, meta?: Record<string, unknown>) => void } | null;
  metrics?: { observeBackgroundTask?: (taskName: string, payload?: Record<string, unknown>) => void } | null;
}

function normalizePhoneNumber(value: unknown): string {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) {
    return "";
  }
  if (digits.startsWith("0")) {
    return `254${digits.slice(1)}`;
  }
  if (digits.startsWith("7") && digits.length === 9) {
    return `254${digits}`;
  }
  if (digits.startsWith("254")) {
    return digits;
  }
  return digits;
}

function isSqliteUniqueError(error: Error & { code?: string }): boolean {
  const message = String(error?.message || "");
  return String(error?.code || "").toUpperCase() === "SQLITE_CONSTRAINT_UNIQUE"
    || message.toLowerCase().includes("unique constraint failed");
}

function isPrismaUniqueError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  return String(candidate?.code || "") === "P2002" || String(candidate?.message || "").includes("Unique constraint");
}

function createMobileMoneyService(deps: MobileMoneyServiceDeps) {
  const {
    run,
    get,
    all,
    writeAuditLog,
    repaymentService,
    loanLifecycleService,
    mobileMoneyProvider,
    c2bEnabled = false,
    b2cEnabled = false,
    stkEnabled = false,
    webhookToken = "",
    providerTimeoutMs = 15000,
    circuitFailureThreshold = 3,
    circuitResetTimeoutMs = 30000,
    logger = null,
    metrics = null,
  } = deps;
  const mobileMoneyReadRepository = createMobileMoneyReadRepository({ all, get });
  const stkCircuitBreaker = createCircuitBreaker({
    name: "mobile_money.stk",
    timeoutMs: providerTimeoutMs,
    failureThreshold: circuitFailureThreshold,
    resetTimeoutMs: circuitResetTimeoutMs,
    logger,
    metrics,
  });
  const b2cCircuitBreaker = createCircuitBreaker({
    name: "mobile_money.b2c",
    timeoutMs: providerTimeoutMs,
    failureThreshold: circuitFailureThreshold,
    resetTimeoutMs: circuitResetTimeoutMs,
    logger,
    metrics,
  });

  async function executeProviderRequest<T>(args: {
    breaker: ReturnType<typeof createCircuitBreaker>;
    actionLabel: string;
    work: () => Promise<T>;
  }): Promise<T> {
    try {
      return await args.breaker.execute(args.work);
    } catch (error) {
      if (error instanceof CircuitBreakerOpenError) {
        throw new ServiceUnavailableDomainError(
          `M-Pesa ${args.actionLabel} is temporarily unavailable. Retry after the circuit resets.`,
        );
      }
      if (error instanceof CircuitBreakerTimeoutError) {
        throw new UpstreamServiceError(`M-Pesa ${args.actionLabel} timed out after ${error.timeoutMs}ms`);
      }
      throw error;
    }
  }

  async function resolveLoanByAccountReference(accountReference: string) {
    const trimmed = String(accountReference || "").trim();
    if (!trimmed) {
      return null;
    }
    const numericMatch = trimmed.match(/\d+/);
    const numericCandidate = numericMatch ? Number(numericMatch[0]) : null;
    if (numericCandidate && Number.isInteger(numericCandidate) && numericCandidate > 0) {
      const byId = await prisma.loans.findUnique({
        where: { id: numericCandidate },
        select: { id: true, status: true, branch_id: true },
      });
      if (byId) {
        return byId;
      }
    }

    const exactReferenceCandidates = [...new Set([
      trimmed,
      trimmed.toLowerCase(),
      trimmed.toUpperCase(),
    ])];
    const matched = await prisma.loans.findFirst({
      where: {
        external_reference: {
          in: exactReferenceCandidates,
        },
      },
      select: {
        id: true,
        status: true,
        branch_id: true,
      },
    });
    if (!matched) {
      return null;
    }
    return {
      id: matched.id,
      status: matched.status,
      branch_id: matched.branch_id,
    };
  }

  function assertWebhookToken(token: string | null): void {
    if (!c2bEnabled) {
      throw new ServiceUnavailableDomainError("M-Pesa C2B webhook ingestion is disabled");
    }
    if (!webhookToken) {
      throw new ServiceUnavailableDomainError("M-Pesa webhook token is not configured");
    }
    const providedBuffer = Buffer.from(String(token || "").trim());
    const expectedBuffer = Buffer.from(webhookToken);
    if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
      throw new UnauthorizedDomainError("Invalid webhook token");
    }
  }

  function buildWebhookSignature(body: Record<string, any>): string {
    return crypto
      .createHmac("sha256", webhookToken)
      .update(JSON.stringify(body || {}))
      .digest("hex");
  }

  function assertB2CCallbackSignature(signature: string | null, body: Record<string, any>): void {
    if (!b2cEnabled) {
      throw new ServiceUnavailableDomainError("M-Pesa B2C callback processing is disabled");
    }
    if (!webhookToken) {
      throw new ServiceUnavailableDomainError("M-Pesa webhook token is not configured");
    }

    const provided = String(signature || "").trim().toLowerCase();
    if (!provided) {
      throw new UnauthorizedDomainError("Missing B2C callback signature");
    }

    const expected = buildWebhookSignature(body || {}).toLowerCase();
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    if (
      providedBuffer.length !== expectedBuffer.length
      || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedDomainError("Invalid B2C callback signature");
    }
  }

  function parseB2CCallbackPayload(body: Record<string, any>) {
    if (typeof mobileMoneyProvider.parseB2CCallback === "function") {
      return mobileMoneyProvider.parseB2CCallback({ body });
    }

    const providerRequestId = String(body.providerRequestId || body.provider_request_id || "").trim() || null;
    const normalizedStatus = String(body.status || "").trim().toLowerCase();
    const status: "completed" | "failed" = ["completed", "success", "ok"].includes(normalizedStatus)
      ? "completed"
      : "failed";

    return {
      providerRequestId,
      status,
      failureReason: status === "failed"
        ? String(body.failureReason || body.resultDesc || "B2C callback reported failure").trim() || "B2C callback reported failure"
        : null,
      raw: body,
    };
  }

  function mapC2BEventRow(row: C2BEventRowLike) {
    const isUnmatched = String(row.status || "").trim().toLowerCase() === "rejected"
      && !row.loan_id
      && !row.repayment_id;
    return {
      id: Number(row.id),
      provider: row.provider,
      external_receipt: row.external_receipt,
      account_reference: row.account_reference,
      payer_phone: row.payer_phone,
      amount: Number(row.amount || 0),
      paid_at: row.paid_at,
      status: isUnmatched ? "unmatched" : row.status,
      raw_status: row.status,
      loan_id: row.loan_id ? Number(row.loan_id) : null,
      repayment_id: row.repayment_id ? Number(row.repayment_id) : null,
      reconciliation_note: row.reconciliation_note,
      reconciled_at: row.reconciled_at,
      created_at: row.created_at,
    };
  }

  async function markEventReconciled(args: {
    eventId: number;
    loanId: number;
    repaymentId: number;
    reconciliationNote: string;
    transactionClient?: PrismaTransactionClient;
  }) {
    const db = args.transactionClient || prisma;
    const updateResult = await db.mobile_money_c2b_events.updateMany({
      where: {
        id: args.eventId,
        status: {
          in: ["received", "rejected"],
        },
      },
      data: {
        status: "reconciled",
        loan_id: args.loanId,
        repayment_id: args.repaymentId,
        reconciled_at: new Date().toISOString(),
        reconciliation_note: args.reconciliationNote,
      },
    });

    if (Number(updateResult.count || 0) === 1) {
      return;
    }

    const currentEvent = await db.mobile_money_c2b_events.findUnique({
      where: { id: args.eventId },
      select: { status: true, loan_id: true, repayment_id: true },
    });
    const currentStatus = String(currentEvent?.status || "").trim().toLowerCase();
    if (
      currentStatus !== "reconciled"
      || Number(currentEvent?.loan_id || 0) !== args.loanId
      || Number(currentEvent?.repayment_id || 0) !== args.repaymentId
    ) {
      throw new DomainValidationError("C2B event state changed before reconciliation could be finalized");
    }
  }

  async function fetchC2BEventById(eventId: number) {
    const eventRow = await prisma.mobile_money_c2b_events.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        provider: true,
        external_receipt: true,
        account_reference: true,
        payer_phone: true,
        amount: true,
        paid_at: true,
        status: true,
        loan_id: true,
        repayment_id: true,
        reconciliation_note: true,
        reconciled_at: true,
        created_at: true,
      },
    });

    return eventRow ? mapC2BEventRow(eventRow) : null;
  }

  async function initiateSTKPush(args: {
    amount: number;
    phoneNumber: string;
    accountReference?: string;
    transactionDesc?: string | null;
    requestedByUserId: number | null;
    ipAddress?: string | null | undefined;
  }) {
    if (!stkEnabled) {
      throw new ServiceUnavailableDomainError("M-Pesa STK push is disabled");
    }
    if (typeof mobileMoneyProvider.initiateSTKPush !== "function") {
      throw new ServiceUnavailableDomainError("M-Pesa STK provider is not configured");
    }

    const amount = Number(args.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new DomainValidationError("Invalid M-Pesa amount");
    }

    const phoneNumber = normalizePhoneNumber(args.phoneNumber);
    if (!phoneNumber) {
      throw new DomainValidationError("Phone number is required for STK push");
    }

    const accountReference = String(args.accountReference || "Afriserve").trim() || "Afriserve";
    const transactionDesc = String(args.transactionDesc || "Payment").trim() || "Payment";

    const providerResponse = await executeProviderRequest({
      breaker: stkCircuitBreaker,
      actionLabel: "STK push",
      work: () => mobileMoneyProvider.initiateSTKPush!({
        amount,
        phoneNumber,
        accountReference,
        transactionDesc,
      }),
    });

    await writeAuditLog({
      userId: args.requestedByUserId,
      action: "mobile_money.stk.initiated",
      targetType: "mobile_money",
      targetId: null,
      details: JSON.stringify({
        provider: mobileMoneyProvider.providerName,
        providerRequestId: providerResponse.providerRequestId || null,
        checkoutRequestId: providerResponse.checkoutRequestId || null,
        merchantRequestId: providerResponse.merchantRequestId || null,
        amount,
        phoneNumber,
        accountReference,
      }),
      ipAddress: args.ipAddress || null,
    });

    return {
      provider: mobileMoneyProvider.providerName,
      status: String(providerResponse.status || "accepted").trim().toLowerCase() || "accepted",
      providerRequestId: providerResponse.providerRequestId || null,
      checkoutRequestId: providerResponse.checkoutRequestId || null,
      merchantRequestId: providerResponse.merchantRequestId || null,
      accountReference,
      amount,
      phoneNumber,
      raw: providerResponse.raw || {},
    };
  }

  async function handleSTKCallback(args: {
    body: Record<string, any>;
    ipAddress?: string | null | undefined;
  }) {
    if (!stkEnabled) {
      throw new ServiceUnavailableDomainError("M-Pesa STK callback processing is disabled");
    }

    const parsed = typeof mobileMoneyProvider.parseSTKCallback === "function"
      ? mobileMoneyProvider.parseSTKCallback({ body: args.body || {} })
      : {
        providerRequestId: String(args.body?.CheckoutRequestID || args.body?.checkoutRequestId || "").trim() || null,
        checkoutRequestId: String(args.body?.CheckoutRequestID || args.body?.checkoutRequestId || "").trim() || null,
        merchantRequestId: String(args.body?.MerchantRequestID || args.body?.merchantRequestId || "").trim() || null,
        status: Number(args.body?.ResultCode ?? args.body?.resultCode) === 0 ? "completed" : "failed",
        resultCode: Number.isFinite(Number(args.body?.ResultCode ?? args.body?.resultCode))
          ? Number(args.body?.ResultCode ?? args.body?.resultCode)
          : null,
        resultDesc: String(args.body?.ResultDesc || args.body?.resultDesc || "").trim() || null,
        amount: null,
        externalReceipt: null,
        phoneNumber: null,
        paidAt: null,
        raw: args.body || {},
      };

    await writeAuditLog({
      userId: null,
      action: parsed.status === "completed" ? "mobile_money.stk.completed" : "mobile_money.stk.failed",
      targetType: "mobile_money",
      targetId: null,
      details: JSON.stringify({
        provider: mobileMoneyProvider.providerName,
        providerRequestId: parsed.providerRequestId || null,
        checkoutRequestId: parsed.checkoutRequestId || null,
        merchantRequestId: parsed.merchantRequestId || null,
        resultCode: parsed.resultCode,
        resultDesc: parsed.resultDesc,
        amount: parsed.amount,
        externalReceipt: parsed.externalReceipt,
        phoneNumber: parsed.phoneNumber,
        paidAt: parsed.paidAt,
      }),
      ipAddress: args.ipAddress || null,
    });

    return parsed;
  }

  async function handleC2BWebhook(args: {
    body: Record<string, any>;
    webhookToken: string | null;
    ipAddress?: string | null | undefined;
  }) {
    assertWebhookToken(args.webhookToken);

    const parsed = mobileMoneyProvider.parseC2BWebhook({ body: args.body || {} });
    const externalReceipt = String(parsed.externalReceipt || "").trim();
    if (!externalReceipt) {
      throw new DomainValidationError("Missing M-Pesa transaction receipt (TransID)");
    }
    if (!Number.isFinite(parsed.amount) || parsed.amount <= 0) {
      throw new DomainValidationError("Invalid M-Pesa amount");
    }

    const paidAt = parsed.paidAt || new Date().toISOString();
    const accountReference = String(parsed.accountReference || "").trim();
    if (!accountReference) {
      throw new DomainValidationError("Missing BillRefNumber/account reference");
    }

    let eventId = null;
    try {
      const inserted = await prisma.mobile_money_c2b_events.create({
        data: {
          provider: mobileMoneyProvider.providerName,
          external_receipt: externalReceipt,
          account_reference: accountReference,
          payer_phone: normalizePhoneNumber(parsed.payerPhone || ""),
          amount: parsed.amount,
          paid_at: paidAt,
          payload_json: JSON.stringify(args.body || {}),
          status: "received",
          created_at: new Date().toISOString(),
        },
      });
      eventId = Number(inserted.id || 0);
    } catch (error) {
      const maybeError = error instanceof Error ? error : new Error(String(error));
      if (isSqliteUniqueError(maybeError) || isPrismaUniqueError(error)) {
        const existingRepayment = await prisma.repayments.findFirst({
          where: { external_receipt: externalReceipt },
          select: { id: true, loan_id: true },
        });
        return {
          status: "duplicate",
          message: "Receipt already processed",
          repaymentId: existingRepayment?.id || null,
          loanId: existingRepayment?.loan_id || null,
        };
      }
      throw error;
    }

    const existingRepayment = await prisma.repayments.findFirst({
      where: { external_receipt: externalReceipt },
      select: { id: true, loan_id: true },
    });
    if (existingRepayment) {
      await markEventReconciled({
        eventId: Number(eventId || 0),
        loanId: Number(existingRepayment.loan_id || 0),
        repaymentId: Number(existingRepayment.id || 0),
        reconciliationNote: "Matched to existing repayment by external receipt",
      });
      return {
        status: "duplicate",
        message: "Receipt already reconciled",
        repaymentId: existingRepayment.id,
        loanId: existingRepayment.loan_id,
      };
    }

    const loan = await resolveLoanByAccountReference(accountReference);
    if (!loan) {
      const rejectUpdate = await prisma.mobile_money_c2b_events.updateMany({
        where: {
          id: Number(eventId || 0),
          status: "received",
        },
        data: {
          status: "rejected",
          reconciliation_note: `Loan not found for account reference "${accountReference}"`,
        },
      });
      if (Number(rejectUpdate.count || 0) !== 1) {
        const currentEvent = await prisma.mobile_money_c2b_events.findUnique({
          where: { id: Number(eventId || 0) },
          select: { status: true },
        });
        const currentStatus = String(currentEvent?.status || "").trim().toLowerCase();
        if (currentStatus !== "rejected" && currentStatus !== "reconciled") {
          throw new DomainValidationError("C2B event state changed before unmatched receipt could be recorded");
        }
      }
      return {
        status: "unmatched",
        message: "Payment received but no loan matched the account reference",
      };
    }

    try {
      const repaymentResult = await prisma.$transaction(async (tx: any) => {
        const result = await repaymentService.recordRepayment({
          loanId: Number(loan.id),
          payload: {
            amount: parsed.amount,
            note: `M-Pesa C2B ${externalReceipt}`,
          },
          user: {
            sub: null,
          },
          ipAddress: args.ipAddress || null,
          skipScopeCheck: true,
          source: {
            channel: "c2b",
            provider: mobileMoneyProvider.providerName,
            externalReceipt,
            externalReference: accountReference,
            payerPhone: normalizePhoneNumber(parsed.payerPhone || ""),
          },
          transactionClient: tx,
        });
        if (!result.repayment?.id) {
          throw new DomainValidationError("Repayment reconciliation failed to persist a repayment record");
        }

        await markEventReconciled({
          eventId: Number(eventId || 0),
          loanId: Number(loan.id),
          repaymentId: Number(result.repayment.id),
          reconciliationNote: "Auto-reconciled successfully",
          transactionClient: tx,
        });

        return result;
      });

      await writeAuditLog({
        userId: null,
        action: "mobile_money.c2b.reconciled",
        targetType: "loan",
        targetId: Number(loan.id),
        details: JSON.stringify({
          receipt: externalReceipt,
          amount: parsed.amount,
          accountReference,
          repaymentId: repaymentResult.repayment.id,
          provider: mobileMoneyProvider.providerName,
        }),
        ipAddress: args.ipAddress || null,
      });

      return {
        status: "reconciled",
        message: "Payment reconciled to loan installment",
        loanId: Number(loan.id),
        repaymentId: Number(repaymentResult.repayment.id),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to reconcile payment";
      await prisma.mobile_money_c2b_events.updateMany({
        where: {
          id: Number(eventId || 0),
          status: {
            in: ["received", "rejected"],
          },
        },
        data: {
          status: "rejected",
          reconciliation_note: String(errorMessage),
        },
      });
      throw error;
    }
  }

  async function reconcileC2BEventManually(args: {
    eventId: number;
    loanId: number;
    note?: string;
    requestedByUserId: number | null;
    ipAddress?: string | null | undefined;
  }) {
    const event = await prisma.mobile_money_c2b_events.findUnique({
      where: { id: args.eventId },
      select: {
        id: true,
        provider: true,
        external_receipt: true,
        account_reference: true,
        payer_phone: true,
        amount: true,
        status: true,
        repayment_id: true,
      },
    });
    if (!event) {
      throw new DomainValidationError("C2B event not found");
    }

    const normalizedStatus = String(event.status || "").trim().toLowerCase();
    if (normalizedStatus === "reconciled" && Number(event.repayment_id || 0) > 0) {
      throw new DomainValidationError("C2B event is already reconciled");
    }
    if (!["received", "rejected"].includes(normalizedStatus)) {
      throw new DomainValidationError("Only received or rejected C2B events can be reconciled manually");
    }

    const loan = await prisma.loans.findUnique({
      where: { id: args.loanId },
      select: { id: true },
    });
    if (!loan) {
      throw new LoanNotFoundError();
    }

    const externalReceipt = String(event.external_receipt || "").trim();
    const accountReference = String(event.account_reference || "").trim();
    const manualNote = String(args.note || "").trim();
    const existingRepayment = externalReceipt
      ? await prisma.repayments.findFirst({
        where: { external_receipt: externalReceipt },
        select: { id: true, loan_id: true },
      })
      : null;

    let matchedLoanId = Number(loan.id);
    let repaymentId = 0;

    if (existingRepayment) {
      matchedLoanId = Number(existingRepayment.loan_id || 0);
      repaymentId = Number(existingRepayment.id || 0);
      await markEventReconciled({
        eventId: args.eventId,
        loanId: matchedLoanId,
        repaymentId,
        reconciliationNote: manualNote || "Manually linked to existing repayment by external receipt",
      });
    } else {
      const repaymentResult = await prisma.$transaction(async (tx: any) => {
        const result = await repaymentService.recordRepayment({
          loanId: matchedLoanId,
          payload: {
            amount: Number(event.amount || 0),
            note: manualNote || `Manual C2B reconciliation ${externalReceipt}`,
          },
          user: {
            sub: args.requestedByUserId,
          },
          ipAddress: args.ipAddress || null,
          skipScopeCheck: true,
          source: {
            channel: "c2b",
            provider: String(event.provider || mobileMoneyProvider.providerName || "mobile_money"),
            externalReceipt: externalReceipt || null,
            externalReference: accountReference || null,
            payerPhone: normalizePhoneNumber(event.payer_phone || ""),
          },
          transactionClient: tx,
        });
        if (!result.repayment?.id) {
          throw new DomainValidationError("Repayment reconciliation failed to persist a repayment record");
        }

        await markEventReconciled({
          eventId: args.eventId,
          loanId: matchedLoanId,
          repaymentId: Number(result.repayment.id || 0),
          reconciliationNote: manualNote || "Manually reconciled after operator review",
          transactionClient: tx,
        });

        return result;
      });
      repaymentId = Number(repaymentResult.repayment?.id || 0);
    }

    await writeAuditLog({
      userId: args.requestedByUserId,
      action: "mobile_money.c2b.reconciled_manual",
      targetType: "loan",
      targetId: matchedLoanId,
      details: JSON.stringify({
        eventId: args.eventId,
        receipt: externalReceipt || null,
        amount: Number(event.amount || 0),
        accountReference: accountReference || null,
        repaymentId,
        note: manualNote || null,
      }),
      ipAddress: args.ipAddress || null,
    });

    return {
      status: "reconciled",
      loanId: matchedLoanId,
      repaymentId,
      event: await fetchC2BEventById(args.eventId),
    };
  }

  async function disburseLoanToWallet(args: {
    loanId: number;
    payload: {
      notes?: string;
      mobileMoney?: {
        enabled?: boolean;
        phoneNumber?: string;
        accountReference?: string;
        narration?: string;
      };
    };
    user: { sub: number };
    ipAddress: string | null | undefined;
  }) {
    if (!b2cEnabled) {
      throw new ServiceUnavailableDomainError("M-Pesa B2C disbursement is disabled");
    }

    const loanRow = await prisma.loans.findUnique({
      where: { id: args.loanId },
      select: {
        id: true,
        principal: true,
        status: true,
        client_id: true,
      },
    });
    if (!loanRow) {
      throw new LoanNotFoundError();
    }

    const clientRow = await prisma.clients.findUnique({
      where: { id: Number(loanRow.client_id || 0) },
      select: { phone: true },
    });

    const requestedPhone = normalizePhoneNumber(args.payload?.mobileMoney?.phoneNumber || "");
    const fallbackPhone = normalizePhoneNumber(clientRow?.phone || "");
    const phoneNumber = requestedPhone || fallbackPhone;
    if (!phoneNumber) {
      throw new DomainValidationError("Client phone number is required for mobile wallet disbursement");
    }

    const accountReference = String(args.payload?.mobileMoney?.accountReference || `LOAN-${args.loanId}`).trim();
    const narration = String(args.payload?.mobileMoney?.narration || args.payload?.notes || "Loan disbursement").trim() || null;
    const requestId = crypto.randomUUID();

    const initInsert = await prisma.mobile_money_b2c_disbursements.create({
      data: {
        request_id: requestId,
        loan_id: args.loanId,
        provider: mobileMoneyProvider.providerName,
        amount: Number(loanRow.principal || 0),
        phone_number: phoneNumber,
        account_reference: accountReference,
        narration,
        initiated_by_user_id: args.user.sub,
        status: "initiated",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
    const disbursementRowId = Number(initInsert.id || 0);

    let providerResponse;
    try {
      providerResponse = await executeProviderRequest({
        breaker: b2cCircuitBreaker,
        actionLabel: "B2C disbursement",
        work: () => mobileMoneyProvider.initiateB2CDisbursement({
          amount: Number(loanRow.principal || 0),
          phoneNumber,
          accountReference,
          narration,
        }),
      });

      const providerStatus = (() => {
        const normalized = String(providerResponse.status || "accepted").trim().toLowerCase();
        return ["initiated", "accepted", "failed", "core_disbursed", "core_failed", "completed"].includes(normalized)
          ? normalized
          : "accepted";
      })();

      const providerUpdate = await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementRowId,
          status: "initiated",
        },
        data: {
          status: providerStatus,
          provider_request_id: providerResponse.providerRequestId || null,
          provider_response_json: JSON.stringify(providerResponse.raw || {}),
          updated_at: new Date().toISOString(),
        },
      });
      if (Number(providerUpdate.count || 0) !== 1) {
        throw new DomainValidationError("B2C disbursement state changed before provider acceptance could be recorded");
      }

      if (providerStatus === "failed") {
        throw new UpstreamServiceError("M-Pesa disbursement failed: provider returned failed status");
      }

      const corePendingUpdate = await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementRowId,
          status: {
            in: ["initiated", "accepted", "completed"],
          },
        },
        data: {
          status: "core_pending",
          updated_at: new Date().toISOString(),
        },
      });
      if (Number(corePendingUpdate.count || 0) !== 1) {
        const existing = await prisma.mobile_money_b2c_disbursements.findUnique({
          where: { id: disbursementRowId },
          select: { status: true },
        });
        const existingStatus = String(existing?.status || "").trim().toLowerCase();
        if (!["core_pending", "core_disbursed", "completed"].includes(existingStatus)) {
          throw new DomainValidationError("B2C disbursement state changed before core disbursement could start");
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "B2C request failed";
      await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementRowId,
          status: {
            in: ["initiated", "accepted", "failed"],
          },
        },
        data: {
          status: "failed",
          failure_reason: String(errorMessage),
          updated_at: new Date().toISOString(),
        },
      });
      if (error instanceof ServiceUnavailableDomainError || error instanceof UpstreamServiceError) {
        throw error;
      }
      throw new UpstreamServiceError(`M-Pesa disbursement failed: ${String(errorMessage || "unknown error")}`);
    }

    try {
      const coreDisbursement = await loanLifecycleService.disburseLoan({
        loanId: args.loanId,
        payload: {
          notes: [args.payload?.notes, `M-Pesa B2C requestId=${requestId}`].filter(Boolean).join(" | "),
        },
        user: args.user,
        ipAddress: args.ipAddress,
      });

      let mobileMoneyStatus = "core_disbursed";
      const coreDisbursementUpdate = await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementRowId,
          status: {
            in: ["initiated", "accepted", "core_pending"],
          },
        },
        data: {
          status: "core_disbursed",
          updated_at: new Date().toISOString(),
        },
      });
      if (Number(coreDisbursementUpdate.count || 0) !== 1) {
        const existing = await prisma.mobile_money_b2c_disbursements.findUnique({
          where: { id: disbursementRowId },
          select: { status: true },
        });
        const existingStatus = String(existing?.status || "").trim().toLowerCase();
        if (existingStatus === "completed" || existingStatus === "core_disbursed") {
          mobileMoneyStatus = existingStatus;
        } else {
          throw new DomainValidationError("B2C disbursement state changed during core disbursement reconciliation");
        }
      }

      await writeAuditLog({
        userId: args.user.sub,
        action: "mobile_money.b2c.disbursed",
        targetType: "loan",
        targetId: args.loanId,
        details: JSON.stringify({
          requestId,
          provider: mobileMoneyProvider.providerName,
          providerRequestId: providerResponse.providerRequestId || null,
          amount: Number(loanRow.principal || 0),
          phoneNumber,
        }),
        ipAddress: args.ipAddress || null,
      });

      return {
        ...coreDisbursement,
        mobileMoney: {
          requestId,
          provider: mobileMoneyProvider.providerName,
          providerRequestId: providerResponse.providerRequestId || null,
          status: mobileMoneyStatus,
          phoneNumber,
          accountReference,
        },
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Core loan disbursement failed after B2C acceptance";
      await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementRowId,
          status: {
            in: ["core_pending", "accepted", "initiated", "core_failed"],
          },
        },
        data: {
          status: "core_failed",
          failure_reason: String(errorMessage),
          updated_at: new Date().toISOString(),
        },
      });
      // FIX #13: When the provider accepted the transfer but core disbursement failed,
      // money left the account but the loan is stuck as "approved". Write an audit entry
      // flagged for manual reconciliation so ops can force-disburse or reverse.
      try {
        await writeAuditLog({
          userId: args.user.sub,
          action: "mobile_money.b2c.core_failed_needs_reconciliation",
          targetType: "loan",
          targetId: args.loanId,
          details: JSON.stringify({
            requestId,
            disbursementRowId,
            provider: mobileMoneyProvider.providerName,
            amount: Number(loanRow.principal || 0),
            phoneNumber,
            errorMessage,
            action_required: "Manual review: provider transfer may have completed but loan core disbursement failed. Verify with provider and force-disburse or reverse.",
          }),
          ipAddress: args.ipAddress || null,
        });
      } catch (_auditError) {
        // Audit failure must not mask the original error.
      }
      throw new UpstreamServiceError(
        `M-Pesa transfer accepted but core disbursement failed. Manual review required. Reason: ${String(errorMessage || "unknown error")}`,
      );

    }
  }
  async function listC2BEvents(args: { limit?: number; status?: string } = {}) {
    const limit = Math.min(Math.max(Number(args.limit || 50), 1), 200);
    const rows = await mobileMoneyReadRepository.listC2BEvents({
      status: args.status,
      limit,
    });
    return rows.map((row) => mapC2BEventRow(row as unknown as C2BEventRowLike));
  }

  async function listB2CDisbursements(args: {
    limit?: number;
    status?: string;
    loanId?: number;
    providerRequestId?: string;
  } = {}) {
    const limit = Math.min(Math.max(Number(args.limit || 50), 1), 200);
    const rows = await mobileMoneyReadRepository.listB2CDisbursements({
      status: args.status,
      loanId: args.loanId,
      providerRequestId: args.providerRequestId,
      limit,
    });

    return rows.map((row) => ({
      id: Number(row.id),
      request_id: row.request_id,
      loan_id: Number(row.loan_id || 0),
      provider: row.provider,
      amount: Number(row.amount || 0),
      phone_number: row.phone_number,
      account_reference: row.account_reference,
      narration: row.narration || null,
      initiated_by_user_id: row.initiated_by_user_id,
      provider_request_id: row.provider_request_id || null,
      status: row.status,
      failure_reason: row.failure_reason || null,
      reversal_attempts: Number(row.reversal_attempts || 0),
      reversal_last_requested_at: row.reversal_last_requested_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));
  }

  async function getB2CDisbursementSummary(args: {
    status?: string;
    loanId?: number;
  } = {}) {
    const row = await mobileMoneyReadRepository.getB2CDisbursementSummary({
      status: args.status,
      loanId: args.loanId,
    });

    return {
      total: Number(row?.total || 0),
      completed_count: Number(row?.completed_count || 0),
      failed_count: Number(row?.failed_count || 0),
      core_failed_count: Number(row?.core_failed_count || 0),
      reversal_required_count: Number(row?.reversal_required_count || 0),
      total_reversal_attempts: Number(row?.total_reversal_attempts || 0),
    };
  }

  async function retryB2CReversal(args: {
    disbursementId: number;
    requestedByUserId: number | null;
    ipAddress?: string | null | undefined;
  }) {
    const disbursementId = Number(args.disbursementId || 0);
    if (!Number.isInteger(disbursementId) || disbursementId <= 0) {
      throw new DomainValidationError("Invalid B2C disbursement id");
    }

    const retryResult = await prisma.$transaction(async (tx: any) => {
      const disbursement = await tx.mobile_money_b2c_disbursements.findUnique({
        where: { id: disbursementId },
        select: {
          id: true,
          loan_id: true,
          request_id: true,
          provider_request_id: true,
          status: true,
          failure_reason: true,
          provider_response_json: true,
        },
      });

      if (!disbursement) {
        throw new DomainValidationError("B2C disbursement record not found");
      }

      const currentStatus = String(disbursement.status || "").trim().toLowerCase();
      if (!["failed", "core_failed"].includes(currentStatus)) {
        throw new DomainValidationError("Reversal retry is only allowed for failed B2C disbursements");
      }

      const nowIso = new Date().toISOString();
      const existingReason = String(disbursement.failure_reason || "").trim();
      const retryReason = [
        existingReason,
        `[reversal_retry_requested_at=${nowIso}]`,
      ].filter(Boolean).join(" ");

      const existingProviderResponse = (() => {
        const raw = String(disbursement.provider_response_json || "").trim();
        if (!raw) {
          return {};
        }
        try {
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === "object" ? parsed : {};
        } catch (_error) {
          return {};
        }
      })();

      const nextProviderResponse = {
        ...existingProviderResponse,
        reversal: {
          requested: true,
          requestedAt: nowIso,
          requestedByUserId: args.requestedByUserId,
          mode: "manual_alert",
        },
      };

      const updateResult = await tx.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementId,
          status: {
            in: ["failed", "core_failed"],
          },
        },
        data: {
          failure_reason: retryReason,
          provider_response_json: JSON.stringify(nextProviderResponse),
          reversal_attempts: {
            increment: 1,
          },
          reversal_last_requested_at: nowIso,
          updated_at: nowIso,
        },
      });

      if (Number(updateResult.count || 0) !== 1) {
        throw new DomainValidationError("B2C disbursement state changed before reversal retry could be recorded");
      }

      const refreshed = await tx.mobile_money_b2c_disbursements.findUnique({
        where: { id: disbursementId },
        select: {
          reversal_attempts: true,
          reversal_last_requested_at: true,
        },
      });

      return {
        disbursement,
        currentStatus,
        nowIso,
        refreshed,
      };
    });

    await writeAuditLog({
      userId: args.requestedByUserId,
      action: "mobile_money.b2c.reversal_retry_requested",
      targetType: "loan",
      targetId: Number(retryResult.disbursement.loan_id || 0),
      details: JSON.stringify({
        disbursementId,
        requestId: retryResult.disbursement.request_id,
        providerRequestId: retryResult.disbursement.provider_request_id,
        status: retryResult.currentStatus,
      }),
      ipAddress: args.ipAddress || null,
    });

    return {
      status: "queued_manual_reversal",
      message: "Reversal retry request recorded. Manual provider follow-up required.",
      manualActionRequired: true,
      disbursementId,
      loanId: Number(retryResult.disbursement.loan_id || 0),
      providerRequestId: retryResult.disbursement.provider_request_id || null,
      requestId: retryResult.disbursement.request_id,
      reversalAttempts: Number(retryResult.refreshed?.reversal_attempts || 0),
      reversalLastRequestedAt: retryResult.refreshed?.reversal_last_requested_at || retryResult.nowIso,
    };
  }

  async function retryB2CCoreDisbursement(args: {
    disbursementId: number;
    requestedByUserId: number | null;
    ipAddress?: string | null | undefined;
  }) {
    const disbursementId = Number(args.disbursementId || 0);
    if (!Number.isInteger(disbursementId) || disbursementId <= 0) {
      throw new DomainValidationError("Invalid B2C disbursement id");
    }
    const requestedByUserId = Number(args.requestedByUserId || 0);
    if (!Number.isInteger(requestedByUserId) || requestedByUserId <= 0) {
      throw new DomainValidationError("requestedByUserId is required for core disbursement retry");
    }

    const disbursement = await prisma.mobile_money_b2c_disbursements.findUnique({
      where: { id: disbursementId },
      select: {
        id: true,
        loan_id: true,
        request_id: true,
        provider_request_id: true,
        status: true,
        failure_reason: true,
      },
    });
    if (!disbursement) {
      throw new DomainValidationError("B2C disbursement record not found");
    }

    const currentStatus = String(disbursement.status || "").trim().toLowerCase();
    if (!["core_failed", "accepted", "core_pending"].includes(currentStatus)) {
      throw new DomainValidationError("Core disbursement retry is only allowed for accepted/core_failed/core_pending B2C disbursements");
    }

    const nowIso = new Date().toISOString();
    try {
      const coreDisbursement = await loanLifecycleService.disburseLoan({
        loanId: Number(disbursement.loan_id || 0),
        payload: {
          notes: [
            `B2C core retry disbursementId=${disbursementId}`,
            `requestId=${String(disbursement.request_id || "")}`.trim(),
          ].filter(Boolean).join(" | "),
        },
        user: { sub: requestedByUserId },
        ipAddress: args.ipAddress || null,
      });

      const updateResult = await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: disbursementId,
          status: {
            in: ["accepted", "core_failed", "core_pending", "core_disbursed"],
          },
        },
        data: {
          status: "core_disbursed",
          failure_reason: null,
          updated_at: nowIso,
        },
      });
      if (Number(updateResult.count || 0) !== 1) {
        throw new DomainValidationError("B2C disbursement state changed before core retry could be finalized");
      }

      await writeAuditLog({
        userId: args.requestedByUserId,
        action: "mobile_money.b2c.core_disbursement_retried",
        targetType: "loan",
        targetId: Number(disbursement.loan_id || 0),
        details: JSON.stringify({
          disbursementId,
          requestId: disbursement.request_id,
          providerRequestId: disbursement.provider_request_id || null,
          previousStatus: currentStatus,
          result: "core_disbursed",
        }),
        ipAddress: args.ipAddress || null,
      });

      return {
        status: "core_disbursed",
        message: "Core disbursement retry completed successfully",
        disbursementId,
        loanId: Number(disbursement.loan_id || 0),
        requestId: disbursement.request_id,
        providerRequestId: disbursement.provider_request_id || null,
        coreDisbursement,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Core disbursement retry failed";
      const nextFailureReason = [
        String(disbursement.failure_reason || "").trim(),
        `[core_retry_failed_at=${nowIso}]`,
        String(errorMessage || "").trim(),
      ].filter(Boolean).join(" ");

      await prisma.mobile_money_b2c_disbursements.updateMany({
        where: { id: disbursementId },
        data: {
          status: "core_failed",
          failure_reason: nextFailureReason,
          updated_at: nowIso,
        },
      });

      await writeAuditLog({
        userId: args.requestedByUserId,
        action: "mobile_money.b2c.core_disbursement_retry_failed",
        targetType: "loan",
        targetId: Number(disbursement.loan_id || 0),
        details: JSON.stringify({
          disbursementId,
          requestId: disbursement.request_id,
          providerRequestId: disbursement.provider_request_id || null,
          previousStatus: currentStatus,
          error: String(errorMessage || "unknown error"),
        }),
        ipAddress: args.ipAddress || null,
      });

      throw new UpstreamServiceError(
        `Core disbursement retry failed for accepted B2C transfer: ${String(errorMessage || "unknown error")}`,
      );
    }
  }

  async function processPendingB2CCoreDisbursements(args: {
    limit?: number;
    minAgeMs?: number;
  } = {}) {
    if (!b2cEnabled) {
      return {
        skipped: true,
        reason: "b2c_disabled",
        scanned: 0,
        claimed: 0,
        processed: 0,
        succeeded: 0,
        failed: 0,
      };
    }

    const limit = Math.min(Math.max(Number(args.limit || 25), 1), 200);
    const minAgeMs = Math.max(0, Number(args.minAgeMs || 30000));
    const cutoff = new Date(Date.now() - minAgeMs);

    const candidates = await prisma.mobile_money_b2c_disbursements.findMany({
      where: {
        status: {
          in: ["accepted", "core_failed", "core_pending"],
        },
        updated_at: {
          lte: cutoff,
        },
      },
      orderBy: {
        updated_at: "asc",
      },
      take: limit,
      select: {
        id: true,
        loan_id: true,
        request_id: true,
        provider_request_id: true,
        status: true,
        failure_reason: true,
        initiated_by_user_id: true,
        updated_at: true,
      },
    });

    let claimed = 0;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let skippedCount = 0;

    for (const row of candidates) {
      const claimResult = await prisma.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: Number(row.id || 0),
          status: row.status,
          updated_at: new Date(row.updated_at),
        },
        data: {
          status: "core_pending",
          updated_at: new Date().toISOString(),
        },
      });
      if (Number(claimResult.count || 0) !== 1) {
        skippedCount += 1;
        continue;
      }

      claimed += 1;
      const requestedByUserId = Number(row.initiated_by_user_id || 0);
      if (!Number.isInteger(requestedByUserId) || requestedByUserId <= 0) {
        const nowIso = new Date().toISOString();
        const nextFailureReason = [
          String(row.failure_reason || "").trim(),
          `[core_retry_missing_user_at=${nowIso}]`,
        ].filter(Boolean).join(" ");

        await prisma.mobile_money_b2c_disbursements.updateMany({
          where: {
            id: Number(row.id || 0),
            status: "core_pending",
          },
          data: {
            status: "core_failed",
            failure_reason: nextFailureReason,
            updated_at: nowIso,
          },
        });

        processed += 1;
        failed += 1;
        continue;
      }

      try {
        await retryB2CCoreDisbursement({
          disbursementId: Number(row.id || 0),
          requestedByUserId,
          ipAddress: null,
        });
        processed += 1;
        succeeded += 1;
      } catch (_error) {
        processed += 1;
        failed += 1;
      }
    }

    return {
      skipped: false,
      scanned: candidates.length,
      claimed,
      processed,
      succeeded,
      failed,
      skippedCount,
    };
  }

  async function handleB2CCallback(args: {
    body: Record<string, any>;
    signature: string | null;
    ipAddress?: string | null | undefined;
  }) {
    assertB2CCallbackSignature(args.signature, args.body || {});

    const parsed = parseB2CCallbackPayload(args.body || {});
    const providerRequestId = String(parsed.providerRequestId || "").trim();
    if (!providerRequestId) {
      throw new DomainValidationError("Missing provider_request_id in B2C callback payload");
    }

    const callbackResult = await prisma.$transaction(async (tx: any) => {
      const disbursement = await tx.mobile_money_b2c_disbursements.findFirst({
        where: {
          OR: [
            { provider_request_id: providerRequestId },
            { request_id: providerRequestId },
          ],
        },
        select: {
          id: true,
          loan_id: true,
          request_id: true,
          provider_request_id: true,
          status: true,
          failure_reason: true,
        },
      });

      if (!disbursement) {
        return {
          status: "unmatched",
          message: "No disbursement record found for provider request id",
          providerRequestId,
        };
      }

      const nextStatus = parsed.status === "completed" ? "completed" : "failed";
      const currentStatus = String(disbursement.status || "").trim().toLowerCase();
      const nowIso = new Date().toISOString();
      const failureReason = nextStatus === "failed"
        ? String(parsed.failureReason || "B2C callback reported failure")
        : null;

      if (currentStatus === "completed" && nextStatus === "failed") {
        return {
          status: "completed",
          message: "B2C callback received but disbursement is already finalized as completed",
          reversalRequired: false,
          disbursementId: Number(disbursement.id),
          loanId: Number(disbursement.loan_id || 0),
          providerRequestId,
          requestId: disbursement.request_id,
          failureReason: disbursement.failure_reason || null,
          skipAudit: true,
        };
      }

      const allowedStatuses = nextStatus === "completed"
        ? ["initiated", "accepted", "core_pending", "core_disbursed", "completed"]
        : ["initiated", "accepted", "core_pending", "core_disbursed", "failed", "core_failed"];

      const updateResult = await tx.mobile_money_b2c_disbursements.updateMany({
        where: {
          id: Number(disbursement.id),
          status: {
            in: allowedStatuses,
          },
        },
        data: {
          status: nextStatus,
          failure_reason: failureReason,
          provider_response_json: JSON.stringify(parsed.raw || {}),
          updated_at: nowIso,
        },
      });

      if (Number(updateResult.count || 0) !== 1) {
        const latest = await tx.mobile_money_b2c_disbursements.findUnique({
          where: { id: Number(disbursement.id) },
          select: {
            id: true,
            loan_id: true,
            request_id: true,
            provider_request_id: true,
            status: true,
            failure_reason: true,
          },
        });

        return {
          status: String(latest?.status || "failed").trim().toLowerCase(),
          message: "B2C callback received but no state transition was applied",
          reversalRequired: String(latest?.status || "").trim().toLowerCase() === "failed",
          disbursementId: Number(latest?.id || disbursement.id),
          loanId: Number(latest?.loan_id || disbursement.loan_id || 0),
          providerRequestId,
          requestId: latest?.request_id || disbursement.request_id,
          failureReason: latest?.failure_reason || null,
          skipAudit: true,
        };
      }

      return {
        status: nextStatus,
        message: nextStatus === "completed"
          ? "B2C disbursement callback reconciled as completed"
          : "B2C disbursement callback reconciled as failed",
        reversalRequired: nextStatus === "failed",
        disbursementId: Number(disbursement.id),
        loanId: Number(disbursement.loan_id || 0),
        providerRequestId,
        requestId: disbursement.request_id,
        failureReason,
        skipAudit: false,
      };
    });

    if (callbackResult.status === "unmatched") {
      return callbackResult;
    }

    if (callbackResult.status === "failed" && !callbackResult.skipAudit) {
      await writeAuditLog({
        userId: null,
        action: "mobile_money.b2c.failed",
        targetType: "loan",
        targetId: Number(callbackResult.loanId || 0),
        details: JSON.stringify({
          disbursementId: Number(callbackResult.disbursementId),
          requestId: callbackResult.requestId,
          providerRequestId,
          reason: callbackResult.failureReason,
          reversalRequired: true,
        }),
        ipAddress: args.ipAddress || null,
      });
    } else if (callbackResult.status === "completed" && !callbackResult.skipAudit) {
      await writeAuditLog({
        userId: null,
        action: "mobile_money.b2c.completed",
        targetType: "loan",
        targetId: Number(callbackResult.loanId || 0),
        details: JSON.stringify({
          disbursementId: Number(callbackResult.disbursementId),
          requestId: callbackResult.requestId,
          providerRequestId,
        }),
        ipAddress: args.ipAddress || null,
      });
    }

    return callbackResult;
  }

  return {
    c2bEnabled,
    b2cEnabled,
    stkEnabled,
    providerName: mobileMoneyProvider.providerName,
    handleC2BWebhook,
    handleB2CCallback,
    initiateSTKPush,
    handleSTKCallback,
    disburseLoanToWallet,
    listC2BEvents,
    reconcileC2BEventManually,
    listB2CDisbursements,
    getB2CDisbursementSummary,
    retryB2CReversal,
    retryB2CCoreDisbursement,
    processPendingB2CCoreDisbursements,
  };
}

export {
  createMobileMoneyService,
};










