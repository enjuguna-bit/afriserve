/**
 * loanLifecycleService.ts
 *
 * This module is a thin facade. All implementation lives in
 * ./loanLifecycle/index.ts (the extracted module).
 *
 * The helper functions that previously existed inside
 * createLoanLifecycleService have been removed — they were defined but
 * never called (the function ended with `return _createFromModule(deps)`
 * which discarded every helper). Keeping dead code of that magnitude
 * in a financial service is an audit and maintenance liability.
 *
 * If you need to add shared lifecycle helpers in future, add them directly
 * inside ./loanLifecycle/ where they can be tested in isolation.
 */

import type { DbRunResult } from "../types/dataLayer.js";
import type { PrismaTransactionClient } from "../db/prismaClient.js";
import { createLoanLifecycleService as _createFromModule } from "./loanLifecycle/index.js";

// ---------------------------------------------------------------------------
// Shared interface types used by the deps contract below
// ---------------------------------------------------------------------------

interface JournalLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: number;
  memo?: string | null | undefined;
}

interface GeneralLedgerServiceLike {
  ACCOUNT_CODES: Record<string, string>;
  postJournal: (options: {
    run?: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get?: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
    tx?: PrismaTransactionClient;
    referenceType: string;
    referenceId: number | null | undefined;
    loanId: number | null | undefined;
    clientId: number | null | undefined;
    branchId: number | null | undefined;
    description: string;
    note: string | null | undefined;
    postedByUserId: number | null | undefined;
    lines: JournalLine[];
  }) => Promise<number>;
}

// ---------------------------------------------------------------------------
// Public deps contract — consumed by serviceRegistry
// ---------------------------------------------------------------------------

export interface LoanLifecycleServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, unknown>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: {
    run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, unknown> | null | undefined>;
  }) => Promise<unknown> | unknown) => Promise<unknown>;
  hierarchyService: any;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
  addWeeksIso: (isoDate: string, weeksToAdd: number) => string;
  writeAuditLog: (payload: {
    userId?: number | null;
    action: string;
    targetType?: string | null;
    targetId?: number | null;
    details?: string | null;
    ipAddress?: string | null;
  }) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  requireVerifiedClientKycForLoanApproval: boolean;
  generalLedgerService: GeneralLedgerServiceLike;
  publishDomainEvent?: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    tenantId?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }, tx?: PrismaTransactionClient) => Promise<number>;
}

// ---------------------------------------------------------------------------
// Factory — delegates entirely to the extracted loanLifecycle module
// ---------------------------------------------------------------------------

function createLoanLifecycleService(deps: LoanLifecycleServiceDeps) {
  return _createFromModule(deps);
}

export {
  createLoanLifecycleService,
};
