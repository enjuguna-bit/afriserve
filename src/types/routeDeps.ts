import type { LoggerLike } from "./runtime.js";
import type { RouteRegistrarApp, ScopeCondition } from "./systemRoutes.js";
import type { ReportCacheLike } from "./cache.js";
import type { HierarchyServiceLike as ServiceHierarchyServiceLike } from "./serviceContracts.js";

export interface DatabaseRunResult {
  lastID?: number;
  changes?: number;
  [key: string]: unknown;
}

export interface TransactionContext {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
}

export interface ParseSchemaLike<T = any> {
  parse: (value: unknown) => T;
}

export interface CommonHierarchyServiceLike {
  resolveHierarchyScope: ServiceHierarchyServiceLike["resolveHierarchyScope"];
  buildScopeCondition: (scope: unknown, column: string) => ScopeCondition;
}

export interface AuthHierarchyServiceLike extends CommonHierarchyServiceLike {
  getAreaManagerBranchIds: ServiceHierarchyServiceLike["getAreaManagerBranchIds"];
  invalidateHierarchyCaches: ServiceHierarchyServiceLike["invalidateHierarchyCaches"];
}

export type ClientHierarchyServiceLike = ServiceHierarchyServiceLike;

export type BranchHierarchyServiceLike = ClientHierarchyServiceLike;

export interface UserHierarchyServiceLike extends BranchHierarchyServiceLike {
  replaceAreaManagerAssignments: ServiceHierarchyServiceLike["replaceAreaManagerAssignments"];
  normalizeIds: ServiceHierarchyServiceLike["normalizeIds"];
}

export interface HierarchyEventServiceLike {
  publishHierarchyEvent?: (payload: Record<string, any>) => Promise<void> | void;
  listHierarchyEvents?: (payload: { sinceId: number; limit: number; scope: any }) => Promise<Array<Record<string, any>>>;
}

export interface AuthRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (tx: TransactionContext) => any) => Promise<any>;
  authenticate: (...args: any[]) => any;
  createToken: (user: Record<string, any>) => string;
  verifyToken: (token: string) => Record<string, any>;
  issueRefreshToken: (
    userId: number,
    tokenVersion: number,
    options?: { tenantId?: string | null },
  ) => Promise<string>;
  rotateRefreshToken: (
    refreshToken: string,
  ) => Promise<{ userId: number; tokenVersion: number; refreshToken: string; tenantId: string }>;
  revokeRefreshToken: (refreshToken: string) => Promise<void>;
  blacklistToken: (token: string) => Promise<void>;
  authLimiter: any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  issuePasswordResetToken: (payload: Record<string, any>) => Promise<void> | void;
  hierarchyService: AuthHierarchyServiceLike;
  getRoleCatalog?: () => Record<string, any>;
  normalizeEmail: (value: unknown) => string;
  createHttpError: (status: number, message: string) => Error & { status: number };
  logger?: LoggerLike | null;
  loginSchema: ParseSchemaLike;
  refreshTokenSchema: ParseSchemaLike;
  changePasswordSchema: ParseSchemaLike;
  resetPasswordRequestSchema: ParseSchemaLike;
  resetPasswordConfirmSchema: ParseSchemaLike;
  bcrypt: {
    compare: (plainText: string, hash: string) => Promise<boolean>;
    hash: (plainText: string, rounds: number) => Promise<string>;
  };
  crypto: {
    createHash: (algorithm: string) => {
      update: (value: string) => { digest: (encoding: string) => string };
      digest: (encoding: string) => string;
    };
  };
  loginMaxFailedAttempts: number;
  loginLockMinutes: number;
}

export interface ClientRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (tx: TransactionContext) => any) => Promise<any>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  parseId: (value: unknown) => number | null;
  createClientSchema: ParseSchemaLike;
  updateClientSchema: ParseSchemaLike;
  updateClientKycSchema: ParseSchemaLike;
  createClientProfileRefreshSchema: ParseSchemaLike;
  updateClientProfileRefreshDraftSchema: ParseSchemaLike;
  listClientProfileRefreshesQuerySchema: ParseSchemaLike;
  reviewClientProfileRefreshSchema: ParseSchemaLike;
  createClientGuarantorSchema: ParseSchemaLike;
  updateClientGuarantorSchema: ParseSchemaLike;
  createClientCollateralSchema: ParseSchemaLike;
  updateClientCollateralSchema: ParseSchemaLike;
  recordClientFeePaymentSchema: ParseSchemaLike;
  potentialClientDuplicateQuerySchema: ParseSchemaLike;
  portfolioReallocationSchema: ParseSchemaLike;
  hierarchyService: ClientHierarchyServiceLike;
  reportCache?: ReportCacheLike | null;
  serviceRegistry?: AppServiceRegistryLike | null;
}

export interface UploadRouteDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  hierarchyService: ClientHierarchyServiceLike;
  documentStorage: {
    maxFileSizeBytes: number;
    storeClientDocument: (payload: {
      clientId: number;
      documentType: "photo" | "id_document" | "guarantor_id_document" | "collateral_document";
      fileBuffer: Buffer;
      mimeType: string;
      originalName: string;
    }) => Promise<{ url: string; objectKey: string; storageDriver: "local" | "s3" }>;
  };
  reportCache?: ReportCacheLike | null;
}

export interface CollectionRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  createCollectionActionSchema: ParseSchemaLike;
  updateCollectionActionSchema: ParseSchemaLike;
  hierarchyService: ClientHierarchyServiceLike;
  reportCache?: ReportCacheLike | null;
}

export interface BranchRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  parseId: (value: unknown) => number | null;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  createBranchSchema: ParseSchemaLike;
  updateBranchSchema: ParseSchemaLike;
  hierarchyService: BranchHierarchyServiceLike;
  hierarchyEventService?: HierarchyEventServiceLike | null;
  reportCache?: ReportCacheLike | null;
  logger?: LoggerLike | null;
}

export interface UserRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  issuePasswordResetToken: (payload: Record<string, any>) => Promise<Record<string, any>> | Record<string, any>;
  normalizeEmail: (value: unknown) => string;
  createHttpError: (status: number, message: string) => Error & { status: number };
  parseId: (value: unknown) => number | null;
  createUserSchema: ParseSchemaLike;
  updateUserProfileSchema: ParseSchemaLike;
  allocateUserRoleSchema: ParseSchemaLike;
  adminResetPasswordSchema: ParseSchemaLike;
  getAllowedRoles: () => string[];
  getRoleCatalog: () => Record<string, any>;
  normalizeRoleInput: (role: unknown) => any;
  hierarchyService: UserHierarchyServiceLike;
  hierarchyEventService?: HierarchyEventServiceLike | null;
  publishDomainEvent?: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    tenantId?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }) => Promise<number>;
  reportCache?: ReportCacheLike | null;
  bcrypt: {
    hash: (plainText: string, rounds: number) => Promise<string>;
  };
  logger?: LoggerLike | null;
}

export interface LoanProductCatalogServiceLike {
  getDefaultLoanProduct: () => Promise<Record<string, any> | null | undefined>;
  getLoanProductById: (productId: number) => Promise<Record<string, any> | null | undefined>;
  resolveLoanProduct: (payload: { productId?: number }) => Promise<Record<string, any>>;
}

interface RepaymentRouteServiceLike {
  recordRepayment: (options: {
    loanId: number;
    payload: Record<string, any>;
    user?: Record<string, any>;
    ipAddress: string | null | undefined;
  }) => Promise<Record<string, any>>;
}

interface LoanLifecycleRouteServiceLike {
  writeOffLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  restructureLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  topUpLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  refinanceLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  extendLoanTerm: (options: Record<string, any>) => Promise<Record<string, any>>;
  approveLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  rejectLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  disburseLoan: (options: Record<string, any>) => Promise<Record<string, any>>;
  getDisbursementTranches: (options: Record<string, any>) => Promise<Record<string, any>>;
  getLoanContractVersions: (options: Record<string, any>) => Promise<Record<string, any>>;
  reviewHighRiskApprovalRequest: (options: Record<string, any>) => Promise<Record<string, any>>;
}

interface MobileMoneyRouteServiceLike {
  handleC2BWebhook: (options: Record<string, any>) => Promise<Record<string, any>>;
  handleB2CCallback: (options: Record<string, any>) => Promise<Record<string, any>>;
  initiateSTKPush: (options: Record<string, any>) => Promise<Record<string, any>>;
  handleSTKCallback: (options: Record<string, any>) => Promise<Record<string, any>>;
  disburseLoanToWallet: (options: Record<string, any>) => Promise<Record<string, any>>;
  listC2BEvents: (options: Record<string, any>) => Promise<Record<string, any>>;
  reconcileC2BEventManually: (options: Record<string, any>) => Promise<Record<string, any>>;
  listB2CDisbursements: (options: Record<string, any>) => Promise<Record<string, any>>;
  getB2CDisbursementSummary: (options: Record<string, any>) => Promise<Record<string, any>>;
  retryB2CReversal: (options: Record<string, any>) => Promise<Record<string, any>>;
  retryB2CCoreDisbursement: (options: Record<string, any>) => Promise<Record<string, any>>;
}

export interface AppServiceRegistryLike {
  loan: {
    loanProductCatalogService: LoanProductCatalogServiceLike;
    generalLedgerService: Record<string, any>;
    loanUnderwritingService: {
      refreshLoanAssessment: (loanId: number) => Promise<Record<string, unknown> | null | undefined>;
      getLoanAssessment: (loanId: number) => Promise<Record<string, unknown> | null | undefined>;
    };
    loanService: Record<string, any>;
    repaymentService: RepaymentRouteServiceLike;
    loanLifecycleService: LoanLifecycleRouteServiceLike;
    mobileMoneyService: MobileMoneyRouteServiceLike | null;
    /**
     * CQRS command handlers — preferred entry points for loan mutations.
     * Routes should call through these rather than invoking loanService directly.
     */
    commands: {
      createLoanApplication: {
        handle: (command: {
          clientId: number;
          principal: number;
          termWeeks: number;
          productId?: number | null;
          interestRate?: number | null;
          registrationFee?: number | null;
          processingFee?: number | null;
          branchId?: number | null;
          officerId?: number | null;
          purpose?: string | null;
          createdByUserId: number;
          createdByRole?: string | null;
          createdByRoles?: string[];
          createdByPermissions?: string[];
          createdByBranchId?: number | null;
          ipAddress?: string | null;
        }) => Promise<{ loanId: number }>;
      };
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
    reportQueryService: Record<string, any>;
    fxRateService: Record<string, any>;
    suspenseAccountingService: Record<string, any>;
    coaVersioningService: Record<string, any>;
    accountingBatchService: Record<string, any>;
    incomeTrackingService: Record<string, any>;
  };
  client: {
    clientRepository: {
      findById: (id: unknown) => Promise<any>;
      save: (client: unknown) => Promise<void>;
    };
  };
}

export interface LoanRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (tx: TransactionContext) => any) => Promise<any>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  parseId: (value: unknown) => number | null;
  addWeeksIso: (isoDate: string, weeksToAdd: number) => string;
  createHttpError: (status: number, message: string) => Error & { status: number };
  calculateExpectedTotal: (principal: number, interestRate: number, termWeeks?: number) => number;
  createLoanSchema: ParseSchemaLike;
  createRepaymentSchema: ParseSchemaLike;
  createGuarantorSchema: ParseSchemaLike;
  createCollateralAssetSchema: ParseSchemaLike;
  /** Schema for PATCH /api/collateral-assets/:id — all fields optional, status includes "liquidated". */
  updateCollateralAssetSchema: ParseSchemaLike;
  linkLoanGuarantorSchema: ParseSchemaLike;
  linkLoanCollateralSchema: ParseSchemaLike;
  loanLifecycleActionSchema: ParseSchemaLike;
  restructureLoanSchema: ParseSchemaLike;
  topUpLoanSchema: ParseSchemaLike;
  refinanceLoanSchema: ParseSchemaLike;
  extendLoanTermSchema: ParseSchemaLike;
  assignLoanOfficerSchema: ParseSchemaLike;
  updateLoanDetailsSchema: ParseSchemaLike;
  createLoanProductSchema: ParseSchemaLike;
  updateLoanProductSchema: ParseSchemaLike;
  approveLoanSchema: ParseSchemaLike;
  disburseLoanSchema: ParseSchemaLike;
  rejectLoanSchema: ParseSchemaLike;
  hierarchyService: ClientHierarchyServiceLike;
  requireVerifiedClientKycForLoanApproval: boolean;
  allowConcurrentLoans: boolean;
  mobileMoneyProvider?: any;
  mobileMoneyC2BEnabled?: boolean;
  mobileMoneyB2CEnabled?: boolean;
  mobileMoneyStkEnabled?: boolean;
  mobileMoneyWebhookToken?: string;
  serviceRegistry?: AppServiceRegistryLike | null;
  publishDomainEvent?: (payload: {
    eventType: string;
    aggregateType: string;
    aggregateId: number | null | undefined;
    tenantId?: string | null | undefined;
    payload?: Record<string, unknown> | null | undefined;
    metadata?: Record<string, unknown> | null | undefined;
    occurredAt?: string | null | undefined;
  }) => Promise<number>;
  reportCache?: ReportCacheLike | null;
}

export interface ReportRouteDeps {
  run: (sql: string, params?: unknown[]) => Promise<DatabaseRunResult>;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  reportGet?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  reportAll?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  executeTransaction: (callback: (tx: TransactionContext) => any) => Promise<any>;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  writeAuditLog?: (payload: Record<string, any>) => Promise<void> | void;
  hierarchyService: ClientHierarchyServiceLike;
  reportCache?: ReportCacheLike | null;
  serviceRegistry?: AppServiceRegistryLike | null;
  logger?: LoggerLike | null;
  metrics?: {
    observeBackgroundTask?: (taskName: string, payload?: Record<string, any>) => void;
  } | null;
}

export type RouteRegistrar = RouteRegistrarApp;
