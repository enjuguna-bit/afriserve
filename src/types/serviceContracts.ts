import type { PrismaTransactionClient } from "../db/prismaClient.js";
import type {
  DbRunResult,
  DbTransactionContext,
  DbTransactionOptions,
  HierarchyScope,
} from "./dataLayer.js";

export type DbRow = Record<string, unknown>;

export type DbGet = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;

export type DbAll = (sql: string, params?: unknown[]) => Promise<DbRow[]>;

export type DbRun = (sql: string, params?: unknown[]) => Promise<DbRunResult>;

export type DbExecuteTransaction = <T = unknown>(
  callback: (tx: DbTransactionContext) => Promise<T> | T,
  options?: DbTransactionOptions,
) => Promise<T>;

export type AuditLogWriter = (payload: {
  userId?: number | null;
  action: string;
  targetType?: string | null;
  targetId?: number | null;
  details?: string | null;
  ipAddress?: string | null;
}) => Promise<void> | void;

export interface HierarchyServiceLike {
  invalidateHierarchyCaches: (params?: { userId?: number | null }) => void;
  getRegions: (options?: { includeInactive?: boolean }) => Promise<DbRow[]>;
  getRegionById: (regionId: unknown) => Promise<DbRow | null | undefined>;
  getBranches: (options?: { includeInactive?: boolean; regionId?: number | null }) => Promise<DbRow[]>;
  getBranchById: (
    branchId: unknown,
    options?: { requireActive?: boolean },
  ) => Promise<DbRow | null | undefined>;
  getBranchesByIds: (
    branchIds: unknown[],
    options?: { requireActive?: boolean },
  ) => Promise<DbRow[]>;
  getAreaManagerBranchIds: (userId: number) => Promise<number[]>;
  replaceAreaManagerAssignments: (userId: number, branchIds: unknown[]) => Promise<number[]>;
  resolveHierarchyScope: (user: unknown) => Promise<HierarchyScope>;
  buildScopeCondition: (
    scope: unknown,
    branchColumnRef: string,
  ) => { sql: string; params: unknown[] };
  addScopeFilter: (params: {
    scope: unknown;
    whereClauses: string[];
    queryParams: unknown[];
    branchColumnRef: string;
  }) => void;
  isBranchInScope: (scope: unknown, branchId: unknown) => boolean;
  projectBranchIdsToScope: (
    scope: unknown,
    branchIds: unknown[],
  ) => number[];
  normalizeIds: (values: unknown[]) => number[];
}

export interface MobileMoneyProviderLike {
  providerName: string;
  parseC2BWebhook: (args: { body: Record<string, unknown> }) => {
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
    raw: Record<string, unknown>;
  }>;
  parseB2CCallback?: (args: { body: Record<string, unknown> }) => {
    providerRequestId: string | null;
    status: "completed" | "failed";
    failureReason: string | null;
    raw: Record<string, unknown>;
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
    raw: Record<string, unknown>;
  }>;
  parseSTKCallback?: (args: { body: Record<string, unknown> }) => {
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
    raw: Record<string, unknown>;
  };
}

export interface ReportCacheLike {
  enabled?: boolean;
  buildKey: (namespace: string, payload?: Record<string, unknown>) => string;
  getOrSet: <T = unknown>(options: {
    key: string;
    compute: () => Promise<T>;
  }) => Promise<{ value: T }>;
  invalidatePrefix: (prefix: string) => Promise<void>;
}

export type DomainEventPublishPayload = {
  eventType: string;
  aggregateType: string;
  aggregateId: number | null | undefined;
  tenantId?: string | null | undefined;
  payload?: Record<string, unknown> | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
  occurredAt?: string | null | undefined;
};

export type DomainEventTransactionLike =
  | PrismaTransactionClient
  | Pick<DbTransactionContext, "run">
  | null
  | undefined;

export type DomainEventPublisher = (
  payload: DomainEventPublishPayload,
  tx?: DomainEventTransactionLike,
) => Promise<number>;
