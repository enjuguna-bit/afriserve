/**
 * Shared types and interfaces for the loan lifecycle module.
 * Extracted from loanLifecycleService.ts as part of Gap 1 decomposition.
 */
import type { DbRunResult } from "../../../types/dataLayer.js";
import type { PrismaTransactionClient } from "../../../db/prismaClient.js";

export interface JournalLine {
  accountCode: string;
  side: "debit" | "credit";
  amount: number;
  memo?: string | null | undefined;
}

export interface GeneralLedgerServiceLike {
  ACCOUNT_CODES: Record<string, string>;
  postJournal: (options: {
    run?: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
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

export interface LoanLifecycleDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: {
    run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
    get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
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
  }, tx?: any) => Promise<number>;
}
