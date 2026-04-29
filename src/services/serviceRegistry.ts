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
import { LoanOnboardingLinkSaga } from "../application/loan/sagas/LoanOnboardingLinkSaga.js";
import { LoanContractVersionSaga } from "../application/loan/sagas/LoanContractVersionSaga.js";
import { LoanUnderwritingRefreshSaga } from "../application/loan/sagas/LoanUnderwritingRefreshSaga.js";
// ClientOnboardingSaga is wired on the shared event bus here so every route
// and background entry point observes the same onboarding sync side effects.
import { ClientOnboardingSaga } from "../application/client/sagas/ClientOnboardingSaga.js";
import type { FeatureFlags } from "../config/featureFlags.js";
import { DEFAULT_FEATURE_FLAGS } from "../config/featureFlags.js";
import type { HierarchyScope } from "../types/dataLayer.js";
import type { LoggerLike, MetricsLike } from "../types/runtime.js";
import type {
  AuditLogWriter,
  DbAll,
  DbExecuteTransaction,
  DbGet,
  DbRun,
  DomainEventPublisher,
  HierarchyServiceLike,
  MobileMoneyProviderLike,
  ReportCacheLike,
} from "../types/serviceContracts.js";

type ReportCacheUserLike = {
  sub?: number | string | null;
  role?: string | null;
};

type ScopeCacheInput = {
  level?: unknown;
  role?: unknown;
  branchId?: unknown;
  regionId?: unknown;
  branchIds?: unknown[];
} | HierarchyScope | null | undefined;

type CreateAppServiceRegistryOptions = {
  get: DbGet;
  all: DbAll;
  readGet?: DbGet;
  readAll?: DbAll;
  run: DbRun;
  executeTransaction: DbExecuteTransaction;
  hierarchyService: HierarchyServiceLike;
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks: number) => number;
  addWeeksIso: (isoDate: string, weeksToAdd: number) => string;
  writeAuditLog: AuditLogWriter;
  invalidateReportCaches: () => Promise<void>;
  requireVerifiedClientKycForLoanApproval: boolean;
  allowConcurrentLoans: boolean;
  mobileMoneyProvider?: MobileMoneyProviderLike | null;
  mobileMoneyC2BEnabled?: boolean;
  mobileMoneyB2CEnabled?: boolean;
  mobileMoneyStkEnabled?: boolean;
  mobileMoneyWebhookToken?: string;
  mobileMoneyProviderTimeoutMs?: number;
  mobileMoneyCircuitFailureThreshold?: number;
  mobileMoneyCircuitResetTimeoutMs?: number;
  reportCache?: ReportCacheLike | null;
  logger?: LoggerLike | null;
  metrics?: MetricsLike | null;
  publishDomainEvent?: DomainEventPublisher;
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
    resolveCachedReport: <T = unknown>(options: {
      namespace: string;
      user: ReportCacheUserLike | undefined;
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

  function toScopeCachePayload(scope: ScopeCacheInput) {
    const rawBranchIds = Array.isArray(scope?.branchIds) ? scope.branchIds : [];
    const branchId = Number(scope?.branchId);
    const regionId = Number(scope?.regionId);
    return {
      level: scope?.level || null,
      role: scope?.role || null,
      branchId: Number.isInteger(branchId) ? branchId : null,
      regionId: Number.isInteger(regionId) ? regionId : null,
      branchIds: rawBranchIds
        .map((value: unknown) => Number(value))
        .filter((value: number) => Number.isInteger(value) && value > 0)
        .sort((first: number, second: number) => first - second),
    };
  }

  async function resolveCachedReport<T = unknown>({
    namespace,
    user,
    scope,
    keyPayload = {},
    compute,
  }: {
    namespace: string;
    user: ReportCacheUserLike | undefined;
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
        scope: toScopeCachePayload(scope as ScopeCacheInput),
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
  const loanOnboardingLinkSaga = new LoanOnboardingLinkSaga({
    executeTransaction,
  });
  const loanContractVersionSaga = new LoanContractVersionSaga({
    executeTransaction,
  });
  const loanUnderwritingRefreshSaga = new LoanUnderwritingRefreshSaga({
    loanUnderwritingService,
  });
  const loanService = createLoanService({
    get,
    all,
    run,
    executeTransaction,
    hierarchyService,
    calculateExpectedTotal,
    resolveLoanProduct: loanProductCatalogService.resolveLoanProduct,
    writeAuditLog,
    invalidateReportCaches,
    allowConcurrentLoans,
    publishDomainEvent,
    loanUnderwritingService,
    loanOnboardingLinkSaga,
    loanContractVersionSaga,
    loanUnderwritingRefreshSaga,
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

  // Loan domain repository -- still used by the non-creation CQRS handlers.
  const loanRepository: ILoanRepository = new SqliteLoanRepository({ get, all, run, executeTransaction });

  // Client repository -- used by client CQRS handlers.
  const clientRepository = new SqliteClientRepository({ get, all, run, executeTransaction });

  // Event bus — OutboxEventBus writes every event to the domain_events outbox table
  // for guaranteed at-least-once delivery. The domainEventDispatch job forwards to
  // any configured external broker. In-process subscribers are still called immediately.
  const eventBus: IEventBus = new OutboxEventBus(publishDomainEvent, logger);

  loanOnboardingLinkSaga.register(eventBus);
  loanContractVersionSaga.register(eventBus);
  loanUnderwritingRefreshSaga.register(eventBus);

  // LoanDisbursementSaga — event-driven disbursement with compensation on failure.
  // Wired to 'loan.approved' so loans approved via the CQRS handler auto-disburse.
  const loanDisbursementSaga = new LoanDisbursementSaga({
    loanLifecycleService,
    mobileMoneyService,
    publishDomainEvent,
    systemUserId: 0,        // system actor — no real user for saga actions
    autoDisburseOnApproval: featureFlags.sagaAutoDisburse,
    autoMobileMoney: featureFlags.sagaAutoDisburse,
  });
  loanDisbursementSaga.register(eventBus);

  // ClientOnboardingSaga subscribes to all domain events that can change
  // onboarding eligibility and keeps onboarding_status in sync from the
  // shared event bus instead of per-route manual triggers.
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
  const createLoanApplication = new CreateLoanApplicationHandler(loanService);
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
