import { getCurrentTenantId } from "../utils/tenantStore.js";
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
import { createIncomeTrackingService } from "./incomeTrackingService.js";
import { SqliteLoanRepository } from "../infrastructure/repositories/SqliteLoanRepository.js";
import type { ILoanRepository } from "../domain/loan/repositories/ILoanRepository.js";
import { SqliteClientRepository } from "../infrastructure/repositories/SqliteClientRepository.js";
import { OutboxEventBus } from "../infrastructure/events/OutboxEventBus.js";
import type { IEventBus } from "../infrastructure/events/IEventBus.js";
import { CreateLoanApplicationHandler } from "../application/loan/handlers/CreateLoanApplicationHandler.js";
import { ApproveLoanHandler }           from "../application/loan/handlers/ApproveLoanHandler.js";
import { RejectLoanHandler }            from "../application/loan/handlers/RejectLoanHandler.js";
import { DisburseLoanHandler }          from "../application/loan/handlers/DisburseLoanHandler.js";
import { RecordRepaymentHandler }       from "../application/loan/handlers/RecordRepaymentHandler.js";
import { GetLoanDetailsHandler }        from "../application/loan/handlers/GetLoanDetailsHandler.js";
import { CreateClientHandler }          from "../application/client/handlers/CreateClientHandler.js";
import { UpdateClientKycHandler }       from "../application/client/handlers/UpdateClientKycHandler.js";
import { UpdateClientProfileHandler }   from "../application/client/handlers/UpdateClientProfileHandler.js";
import { RecordClientFeePaymentHandler } from "../application/client/handlers/RecordClientFeePaymentHandler.js";
import { DeactivateClientHandler, ReactivateClientHandler } from "../application/client/handlers/ClientStatusHandlers.js";
import { GetClientDetailsHandler }      from "../application/client/handlers/GetClientDetailsHandler.js";
import { LoanDisbursementSaga } from "../application/loan/sagas/LoanDisbursementSaga.js";
// Gap 11: ClientOnboardingSaga wired to the event bus at bootstrap so all
// onboarding-relevant domain events automatically trigger syncOnboardingStatus.
import { ClientOnboardingSaga } from "../application/client/sagas/ClientOnboardingSaga.js";
import type { FeatureFlags } from "../config/featureFlags.js";
import { DEFAULT_FEATURE_FLAGS } from "../config/featureFlags.js";

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
  featureFlags?: Partial<FeatureFlags>;
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
    loanRepository: ILoanRepository;
    eventBus: IEventBus;
    loanDisbursementSaga: LoanDisbursementSaga;
    commands: {
      createLoanApplication: CreateLoanApplicationHandler;
      approveLoan: ApproveLoanHandler;
      rejectLoan: RejectLoanHandler;
      disburseLoan: DisburseLoanHandler;
      recordRepayment: RecordRepaymentHandler;
    };
    queries: {
      getLoanDetails: GetLoanDetailsHandler;
    };
  };
  client: {
    clientRepository: SqliteClientRepository;
    clientOnboardingSaga: ClientOnboardingSaga;
    commands: {
      createClient:           CreateClientHandler;
      updateClientKyc:        UpdateClientKycHandler;
      updateClientProfile:    UpdateClientProfileHandler;
      recordClientFeePayment: RecordClientFeePaymentHandler;
      deactivateClient:       DeactivateClientHandler;
      reactivateClient:       ReactivateClientHandler;
    };
    queries: {
      getClientDetails: GetClientDetailsHandler;
    };
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
    incomeTrackingService: ReturnType<typeof createIncomeTrackingService>;
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
    featureFlags: featureFlagsInput = {},
  } = options;

  const featureFlags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS, ...featureFlagsInput };

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
        tenantId: getCurrentTenantId(),
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
  const incomeTrackingService = createIncomeTrackingService({
    get: readGet || get,
    all: readAll || all,
    hierarchyService,
  });

  // Loan domain repository -- wired to the loan aggregate port
  const loanRepository: ILoanRepository = new SqliteLoanRepository({ get, all, run });

  // Client repository (needed by CreateLoanApplicationHandler for eligibility check)
  const clientRepository = new SqliteClientRepository({ get, all, run });

  // Event bus — OutboxEventBus writes every event to the domain_events outbox table
  // for guaranteed at-least-once delivery. The domainEventDispatch job forwards to
  // any configured external broker. In-process subscribers are still called immediately.
  const eventBus: IEventBus = new OutboxEventBus(publishDomainEvent);

  // LoanDisbursementSaga — event-driven disbursement with compensation on failure.
  // Wired to 'loan.approved' so loans approved via the CQRS handler auto-disburse.
  const loanDisbursementSaga = new LoanDisbursementSaga({
    loanLifecycleService,
    mobileMoneyService,
    publishDomainEvent,
    systemUserId: 0,        // system actor — no real user for saga actions
    autoMobileMoney: featureFlags.sagaAutoDisburse,
  });
  loanDisbursementSaga.register(eventBus);

  // ClientOnboardingSaga (Gap 11) — subscribes to all domain events that can
  // change onboarding eligibility and automatically re-syncs onboarding_status.
  // This replaces the 9 manual syncClientOnboardingStatus() calls scattered
  // across clientRouteService.ts (those calls remain and are idempotent; they
  // will be cleaned up as routes are migrated to CQRS handlers).
  const clientOnboardingSaga = new ClientOnboardingSaga(get, run);
  clientOnboardingSaga.register(eventBus);

  const reportQueryService = createReportQueryService({
    get,
    all,
    readGet,
    readAll,
    hierarchyService,
    resolveCachedReport,
  });

  // Command handlers
  const createLoanApplication = new CreateLoanApplicationHandler(loanRepository, clientRepository, eventBus);
  const approveLoan            = new ApproveLoanHandler(loanRepository, eventBus);
  const rejectLoan             = new RejectLoanHandler(loanRepository, eventBus);
  const disburseLoan           = new DisburseLoanHandler(loanRepository, eventBus);
  const recordRepayment        = new RecordRepaymentHandler(loanRepository, eventBus);

  // Query handlers
  const getLoanDetails = new GetLoanDetailsHandler(get, all);

  // Client command handlers
  const createClient           = new CreateClientHandler(clientRepository, eventBus);
  const updateClientKyc        = new UpdateClientKycHandler(clientRepository, eventBus);
  const updateClientProfile    = new UpdateClientProfileHandler(clientRepository, eventBus);
  const recordClientFeePayment = new RecordClientFeePaymentHandler(clientRepository, eventBus);
  const deactivateClient       = new DeactivateClientHandler(clientRepository, eventBus);
  const reactivateClient       = new ReactivateClientHandler(clientRepository, eventBus);

  // Client query handler
  const getClientDetails = new GetClientDetailsHandler(get, all);

  return {
    loan: {
      loanProductCatalogService,
      generalLedgerService,
      loanUnderwritingService,
      loanService,
      repaymentService,
      loanLifecycleService,
      mobileMoneyService,
      loanRepository,
      eventBus,
      loanDisbursementSaga,
      commands: {
        createLoanApplication,
        approveLoan,
        rejectLoan,
        disburseLoan,
        recordRepayment,
      },
      queries: {
        getLoanDetails,
      },
    },
    client: {
      clientRepository,
      clientOnboardingSaga,
      commands: {
        createClient,
        updateClientKyc,
        updateClientProfile,
        recordClientFeePayment,
        deactivateClient,
        reactivateClient,
      },
      queries: {
        getClientDetails,
      },
    },
    report: {
      resolveCachedReport,
      reportQueryService,
      fxRateService,
      suspenseAccountingService,
      coaVersioningService,
      accountingBatchService,
      incomeTrackingService,
    },
  };
}

export {
  createAppServiceRegistry,
};

export type {
  AppServiceRegistry,
};
