import { createGeneralLedgerService } from "./generalLedgerService.js";
import { createAccountingBatchService } from "./accountingBatchService.js";
import { createCoaVersioningService } from "./coaVersioningService.js";
import { createFxRateService } from "./fxRateService.js";
import { createLoanLifecycleService } from "./loanLifecycleService.js";
import { createLoanService } from "./loanService.js";
import type { LoanProductCatalogService } from "./loanProductCatalogService.js";
import { createLoanUnderwritingService } from "./loanUnderwritingService.js";
import { createMobileMoneyService } from "./mobileMoneyService.js";
import { createReportQueryService } from "./reportQueryService.js";
import { createRepaymentService } from "./repaymentService.js";
import { createSuspenseAccountingService } from "./suspenseAccountingService.js";

type CreateAppServiceRegistryOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  readGet?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  readAll?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<any>;
  executeTransaction: (callback: (tx: any) => any) => Promise<any>;
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
  allowConcurrentLoans: boolean;
  mobileMoneyProvider?: any;
  mobileMoneyC2BEnabled?: boolean;
  mobileMoneyB2CEnabled?: boolean;
  mobileMoneyStkEnabled?: boolean;
  mobileMoneyWebhookToken?: string;
  mobileMoneyProviderTimeoutMs?: number;
  mobileMoneyCircuitFailureThreshold?: number;
  mobileMoneyCircuitResetTimeoutMs?: number;
  reportCache?: {
    enabled?: boolean;
    buildKey: (namespace: string, payload?: Record<string, unknown>) => string;
    getOrSet: <T = any>(options: { key: string; compute: () => Promise<T> }) => Promise<{ value: T }>;
    invalidatePrefix: (prefix: string) => Promise<void>;
  } | null;
  logger?: any;
  metrics?: any;
  publishDomainEvent?: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    tenantId?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }) => Promise<number>;
  loanProductCatalogService: LoanProductCatalogService;
};

type AppServiceRegistry = {
  loan: {
    loanProductCatalogService: LoanProductCatalogService;
    generalLedgerService: ReturnType<typeof createGeneralLedgerService>;
    loanUnderwritingService: ReturnType<typeof createLoanUnderwritingService>;
    loanService: ReturnType<typeof createLoanService>;
    repaymentService: ReturnType<typeof createRepaymentService>;
    loanLifecycleService: ReturnType<typeof createLoanLifecycleService>;
    mobileMoneyService: ReturnType<typeof createMobileMoneyService> | null;
  };
  report: {
    resolveCachedReport: <T = any>(options: {
      namespace: string;
      user: Record<string, any> | undefined;
      scope: unknown;
      keyPayload?: Record<string, unknown>;
      compute: () => Promise<T>;
    }) => Promise<T>;
    reportQueryService: ReturnType<typeof createReportQueryService>;
    fxRateService: ReturnType<typeof createFxRateService>;
    suspenseAccountingService: ReturnType<typeof createSuspenseAccountingService>;
    coaVersioningService: ReturnType<typeof createCoaVersioningService>;
    accountingBatchService: ReturnType<typeof createAccountingBatchService>;
  };
};

function createAppServiceRegistry(options: CreateAppServiceRegistryOptions): AppServiceRegistry {
  const {
    get,
    all,
    readGet,
    readAll,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    addWeeksIso,
    writeAuditLog,
    invalidateReportCaches,
    requireVerifiedClientKycForLoanApproval,
    allowConcurrentLoans,
    mobileMoneyProvider = null,
    mobileMoneyC2BEnabled = false,
    mobileMoneyB2CEnabled = false,
    mobileMoneyStkEnabled = false,
    mobileMoneyWebhookToken = "",
    mobileMoneyProviderTimeoutMs = 15000,
    mobileMoneyCircuitFailureThreshold = 3,
    mobileMoneyCircuitResetTimeoutMs = 30000,
    reportCache = null,
    logger = null,
    metrics = null,
    publishDomainEvent = async () => 0,
    loanProductCatalogService,
  } = options;

  function toScopeCachePayload(scope: any) {
    const rawBranchIds = Array.isArray(scope?.branchIds) ? scope.branchIds : [];
    return {
      level: scope?.level || null,
      role: scope?.role || null,
      branchId: Number.isInteger(Number(scope?.branchId)) ? Number(scope.branchId) : null,
      regionId: Number.isInteger(Number(scope?.regionId)) ? Number(scope.regionId) : null,
      branchIds: rawBranchIds
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
        .sort((first: number, second: number) => first - second),
    };
  }

  async function resolveCachedReport<T = any>({
    namespace,
    user,
    scope,
    keyPayload = {},
    compute,
  }: {
    namespace: string;
    user: Record<string, any> | undefined;
    scope: unknown;
    keyPayload?: Record<string, unknown>;
    compute: () => Promise<T>;
  }): Promise<T> {
    if (!reportCache || !reportCache.enabled) {
      return compute();
    }

    const result = await reportCache.getOrSet({
      key: reportCache.buildKey(namespace, {
        userId: user?.sub || null,
        role: user?.role || null,
        scope: toScopeCachePayload(scope),
        ...keyPayload,
      }),
      compute,
    });

    return result.value;
  }

  const generalLedgerService = createGeneralLedgerService();
  const loanUnderwritingService = createLoanUnderwritingService({
    get,
    run,
  });
  const loanService = createLoanService({
    get,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    resolveLoanProduct: loanProductCatalogService.resolveLoanProduct,
    writeAuditLog,
    invalidateReportCaches,
    allowConcurrentLoans,
    loanUnderwritingService,
  });
  const repaymentService = createRepaymentService({
    executeTransaction,
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    generalLedgerService,
  });
  const loanLifecycleService = createLoanLifecycleService({
    get,
    all,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    addWeeksIso,
    writeAuditLog,
    invalidateReportCaches,
    requireVerifiedClientKycForLoanApproval,
    generalLedgerService,
    publishDomainEvent,
  });
  const mobileMoneyService = mobileMoneyProvider
    ? createMobileMoneyService({
      run,
      get,
      all,
      writeAuditLog,
      repaymentService,
      loanLifecycleService,
      mobileMoneyProvider,
      c2bEnabled: mobileMoneyC2BEnabled,
      b2cEnabled: mobileMoneyB2CEnabled,
      stkEnabled: mobileMoneyStkEnabled,
      webhookToken: mobileMoneyWebhookToken,
      providerTimeoutMs: mobileMoneyProviderTimeoutMs,
      circuitFailureThreshold: mobileMoneyCircuitFailureThreshold,
      circuitResetTimeoutMs: mobileMoneyCircuitResetTimeoutMs,
      logger,
      metrics,
    })
    : null;
  const reportQueryService = createReportQueryService({
    get,
    all,
    readGet,
    readAll,
    hierarchyService,
    resolveCachedReport,
  });
  const fxRateService = createFxRateService({
    run,
    get,
    all,
    logger,
  });
  const suspenseAccountingService = createSuspenseAccountingService({
    run,
    get,
    all,
    executeTransaction,
    logger,
  });
  const coaVersioningService = createCoaVersioningService({
    run,
    get,
    all,
    executeTransaction,
  });
  const accountingBatchService = createAccountingBatchService({
    run,
    get,
    all,
    executeTransaction,
    logger,
    metrics,
  });

  return {
    loan: {
      loanProductCatalogService,
      generalLedgerService,
      loanUnderwritingService,
      loanService,
      repaymentService,
      loanLifecycleService,
      mobileMoneyService,
    },
    report: {
      resolveCachedReport,
      reportQueryService,
      fxRateService,
      suspenseAccountingService,
      coaVersioningService,
      accountingBatchService,
    },
  };
}

export {
  createAppServiceRegistry,
};

export type {
  AppServiceRegistry,
};
