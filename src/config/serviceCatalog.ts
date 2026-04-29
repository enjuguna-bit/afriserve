type ServiceCategoryId =
  | "loan-services"
  | "report-services"
  | "collection-services"
  | "hierarchy-branch-services"
  | "accounting-services"
  | "user-permission-services"
  | "approval-workflow-services"
  | "payment-integration-services"
  | "utility-services"
  | "security-services";

type ServiceDependency = string;

type ServiceCatalogEntry = {
  name: string;
  filePath: string;
  categoryId: ServiceCategoryId;
  purpose: string;
  dependencies: ServiceDependency[];
};

type ServiceCategory = {
  id: ServiceCategoryId;
  label: string;
  description: string;
};

const SERVICE_CATEGORIES: ServiceCategory[] = [
  {
    id: "loan-services",
    label: "Loan Services",
    description: "Loan lifecycle orchestration, portfolio operations, products, analytics, and snapshots.",
  },
  {
    id: "report-services",
    label: "Report Services",
    description: "Reporting queries, exports, caching, scheduling, and legacy template support.",
  },
  {
    id: "collection-services",
    label: "Collection Services",
    description: "Collection route aggregation, action workflows, overdue tracking, and analytics.",
  },
  {
    id: "hierarchy-branch-services",
    label: "Hierarchy & Branch Services",
    description: "Scope resolution, hierarchy events, branch CRUD, and branch reporting.",
  },
  {
    id: "accounting-services",
    label: "Accounting Services",
    description: "Ledger posting, accruals, penalties, suspense flows, FX, and chart versioning.",
  },
  {
    id: "user-permission-services",
    label: "User & Permission Services",
    description: "User management routes, role assignments, and permission enforcement.",
  },
  {
    id: "approval-workflow-services",
    label: "Approval Workflow Services",
    description: "Approval request routing and review workflow state.",
  },
  {
    id: "payment-integration-services",
    label: "Payment & Integration Services",
    description: "Mobile money processing, provider integration, and repayment orchestration.",
  },
  {
    id: "utility-services",
    label: "Utility Services",
    description: "Cross-cutting audit, storage, events, logging, metrics, PDF, XLSX, and error tracking.",
  },
  {
    id: "security-services",
    label: "Security Services",
    description: "Password reset, token invalidation/rotation, rate limiting, and auth session caching.",
  },
];

const BACKEND_SERVICE_CATALOG: ServiceCatalogEntry[] = [
  {
    name: "loanLifecycleService",
    filePath: "src/services/loanLifecycleService.ts",
    categoryId: "loan-services",
    purpose: "Core loan state management for approvals, disbursement, restructuring, write-off, and high-risk review.",
    dependencies: ["approvalWorkflowService", "generalLedgerService", "loanWorkflowSnapshotService", "hierarchyService", "domainEventService"],
  },
  {
    name: "loanService",
    filePath: "src/services/loanService.ts",
    categoryId: "loan-services",
    purpose: "Loan creation and core CRUD-style mutations with scope and onboarding checks.",
    dependencies: ["prisma", "hierarchyService", "loanWorkflowSnapshotService", "loanUnderwritingService", "loanProductCatalogService"],
  },
  {
    name: "loanProductCatalogService",
    filePath: "src/services/loanProductCatalogService.ts",
    categoryId: "loan-services",
    purpose: "Loan product lookup and active-product resolution used by loan creation flows.",
    dependencies: ["db"],
  },
  {
    name: "loanRouteService",
    filePath: "src/routes/services/loanRouteService.ts",
    categoryId: "loan-services",
    purpose: "Loan API composition layer that wires route handlers to domain services.",
    dependencies: ["serviceRegistry", "hierarchyService"],
  },
  {
    name: "loanApprovalRequestRouteService",
    filePath: "src/routes/services/loanApprovalRequestRouteService.ts",
    categoryId: "loan-services",
    purpose: "Approval workflow routes for reviewing queued high-risk loan lifecycle requests.",
    dependencies: ["loanLifecycleService", "hierarchyService"],
  },
  {
    name: "loanExecutionRouteService",
    filePath: "src/routes/services/loanExecutionRouteService.ts",
    categoryId: "loan-services",
    purpose: "Disbursement, repayment, restructure, refinance, and term-extension route handlers.",
    dependencies: ["loanLifecycleService", "repaymentService", "mobileMoneyService", "hierarchyService"],
  },
  {
    name: "loanCollateralRouteService",
    filePath: "src/routes/services/loanCollateralRouteService.ts",
    categoryId: "loan-services",
    purpose: "Collateral and guarantor linkage routes for loans.",
    dependencies: ["loanService", "hierarchyService"],
  },
  {
    name: "loanPortfolioRouteService",
    filePath: "src/routes/services/loanPortfolioRouteService.ts",
    categoryId: "loan-services",
    purpose: "Portfolio analytics and loan dashboard route handlers.",
    dependencies: ["reportQueryService", "loanWorkflowSnapshotService", "hierarchyService"],
  },
  {
    name: "loanProductRouteService",
    filePath: "src/routes/services/loanProductRouteService.ts",
    categoryId: "loan-services",
    purpose: "Loan product configuration routes and validation flows.",
    dependencies: ["loanService"],
  },
  {
    name: "loanStatementRouteService",
    filePath: "src/routes/services/loanStatementRouteService.ts",
    categoryId: "loan-services",
    purpose: "Loan statement and payment schedule endpoints.",
    dependencies: ["loanService", "loanWorkflowSnapshotService", "reportQueryService"],
  },
  {
    name: "loanWorkflowSnapshotService",
    filePath: "src/services/loanWorkflowSnapshotService.ts",
    categoryId: "loan-services",
    purpose: "Workflow and onboarding snapshot helpers for client and loan readiness state.",
    dependencies: ["db"],
  },
  {
    name: "loanUnderwritingService",
    filePath: "src/services/loanUnderwritingService.ts",
    categoryId: "loan-services",
    purpose: "Loan assessment refresh, underwriting signals, and risk-state support.",
    dependencies: ["prisma", "auditService"],
  },
  {
    name: "reportQueryService",
    filePath: "src/services/reportQueryService.ts",
    categoryId: "report-services",
    purpose: "Scoped report query execution and cached report composition.",
    dependencies: ["hierarchyService", "prisma", "reportCacheService", "serviceRegistry"],
  },
  {
    name: "reportCacheService",
    filePath: "src/services/reportCacheService.ts",
    categoryId: "report-services",
    purpose: "Memory or Redis-backed caching for report payloads.",
    dependencies: ["ioredis", "metricsService", "logger"],
  },
  {
    name: "reportExportService",
    filePath: "src/services/reportExportService.ts",
    categoryId: "report-services",
    purpose: "Tabular report export formatting for CSV, PDF, XLSX, and JSON passthrough.",
    dependencies: ["pdfService", "xlsxService"],
  },
  {
    name: "scheduledReportService",
    filePath: "src/services/scheduledReportService.ts",
    categoryId: "report-services",
    purpose: "Scheduled report generation and export payload assembly.",
    dependencies: ["prisma", "reportExportService"],
  },
  {
    name: "legacyReportTemplateService",
    filePath: "src/services/legacyReportTemplateService.ts",
    categoryId: "report-services",
    purpose: "Legacy report template compatibility for older export contracts.",
    dependencies: ["reportQueryService"],
  },
  {
    name: "collectionRouteService",
    filePath: "src/routes/services/collectionRouteService.ts",
    categoryId: "collection-services",
    purpose: "Collection API registration entry point.",
    dependencies: ["collectionManagementRouteModule"],
  },
  {
    name: "collectionManagementRouteModule",
    filePath: "src/routes/modules/collectionManagementRouteModule.ts",
    categoryId: "collection-services",
    purpose: "Collection workflow route orchestration module.",
    dependencies: ["collectionOverdueRouteModule", "collectionSummaryRouteModule", "collectionActionMutationRouteModule"],
  },
  {
    name: "collectionOverdueRouteModule",
    filePath: "src/routes/modules/collectionOverdueRouteModule.ts",
    categoryId: "collection-services",
    purpose: "Overdue tracking and delinquency views for collections.",
    dependencies: ["reportQueryService"],
  },
  {
    name: "collectionSummaryRouteModule",
    filePath: "src/routes/modules/collectionSummaryRouteModule.ts",
    categoryId: "collection-services",
    purpose: "Collection analytics and summary reporting routes.",
    dependencies: ["reportQueryService"],
  },
  {
    name: "collectionActionMutationRouteModule",
    filePath: "src/routes/modules/collectionActionMutationRouteModule.ts",
    categoryId: "collection-services",
    purpose: "Collection action creation and update flows.",
    dependencies: ["hierarchyService", "auditService"],
  },
  {
    name: "hierarchyService",
    filePath: "src/services/hierarchyService.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Hierarchy scope resolution, branch visibility checks, and assignment utilities.",
    dependencies: ["prisma"],
  },
  {
    name: "hierarchyEventService",
    filePath: "src/services/hierarchyEventService.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Hierarchy change tracking and event persistence.",
    dependencies: ["prisma"],
  },
  {
    name: "branchManagementRouteModule",
    filePath: "src/routes/modules/branchManagementRouteModule.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Branch read, mutation, and reporting route orchestration.",
    dependencies: ["branchReadRouteModule", "branchMutationRouteModule", "branchReportRouteModule"],
  },
  {
    name: "branchReadRouteModule",
    filePath: "src/routes/modules/branchReadRouteModule.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Branch listing, detail reads, and hierarchy-aware branch visibility routes.",
    dependencies: ["hierarchyService"],
  },
  {
    name: "branchMutationRouteModule",
    filePath: "src/routes/modules/branchMutationRouteModule.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Branch create, update, deactivate, and delete workflow routes.",
    dependencies: ["hierarchyService", "hierarchyEventService", "auditService"],
  },
  {
    name: "branchReportRouteModule",
    filePath: "src/routes/modules/branchReportRouteModule.ts",
    categoryId: "hierarchy-branch-services",
    purpose: "Branch reporting routes and hierarchy-aware summary views.",
    dependencies: ["reportQueryService", "hierarchyService"],
  },
  {
    name: "generalLedgerService",
    filePath: "src/services/generalLedgerService.ts",
    categoryId: "accounting-services",
    purpose: "General ledger journal posting and account movement recording.",
    dependencies: ["prisma", "decimal.js"],
  },
  {
    name: "interestAccrualEngine",
    filePath: "src/services/interestAccrualEngine.ts",
    categoryId: "accounting-services",
    purpose: "Interest accrual calculation and periodic journal staging.",
    dependencies: ["db", "metricsService", "logger"],
  },
  {
    name: "penaltyEngine",
    filePath: "src/services/penaltyEngine.ts",
    categoryId: "accounting-services",
    purpose: "Penalty charge calculation and overdue penalty application.",
    dependencies: ["db", "metricsService", "logger"],
  },
  {
    name: "suspenseAccountingService",
    filePath: "src/services/suspenseAccountingService.ts",
    categoryId: "accounting-services",
    purpose: "Suspense transaction management, FX normalization, and accounting reconciliation.",
    dependencies: ["generalLedgerService", "fxRateService"],
  },
  {
    name: "accountingBatchService",
    filePath: "src/services/accountingBatchService.ts",
    categoryId: "accounting-services",
    purpose: "Batch accounting runs for accrual, close, and periodic processing.",
    dependencies: ["generalLedgerService", "interestAccrualEngine", "logger"],
  },
  {
    name: "coaVersioningService",
    filePath: "src/services/coaVersioningService.ts",
    categoryId: "accounting-services",
    purpose: "Chart of accounts versioning and lifecycle management.",
    dependencies: ["prisma"],
  },
  {
    name: "fxRateService",
    filePath: "src/services/fxRateService.ts",
    categoryId: "accounting-services",
    purpose: "FX rate storage, lookup, and optional remote rate resolution.",
    dependencies: ["db", "logger", "http-client"],
  },
  {
    name: "userRouteService",
    filePath: "src/routes/services/userRouteService.ts",
    categoryId: "user-permission-services",
    purpose: "User CRUD and administration route wiring.",
    dependencies: ["userManagementRouteModule", "userRoleService", "hierarchyService", "permissionService"],
  },
  {
    name: "userManagementRouteModule",
    filePath: "src/routes/modules/userManagementRouteModule.ts",
    categoryId: "user-permission-services",
    purpose: "User workflow route orchestration for reads and account actions.",
    dependencies: ["userReadRouteModule", "userAccountActionRouteModule"],
  },
  {
    name: "userReadRouteModule",
    filePath: "src/routes/modules/userReadRouteModule.ts",
    categoryId: "user-permission-services",
    purpose: "User listing, summary, role catalog, and security-state read routes.",
    dependencies: ["hierarchyService", "permissionService"],
  },
  {
    name: "userAccountActionRouteModule",
    filePath: "src/routes/modules/userAccountActionRouteModule.ts",
    categoryId: "user-permission-services",
    purpose: "User account mutation workflows for profile, roles, permissions, activation, and security actions.",
    dependencies: ["hierarchyService", "permissionService", "auditService", "domainEventService"],
  },
  {
    name: "userRoleService",
    filePath: "src/services/userRoleService.ts",
    categoryId: "user-permission-services",
    purpose: "Role assignment normalization, persistence, and multi-role resolution.",
    dependencies: ["db", "roles-config"],
  },
  {
    name: "permissionService",
    filePath: "src/services/permissionService.ts",
    categoryId: "user-permission-services",
    purpose: "Permission catalog, effective permission resolution, and runtime checks.",
    dependencies: ["db", "userRoleService"],
  },
  {
    name: "approvalWorkflowService",
    filePath: "src/services/approvalWorkflowService.ts",
    categoryId: "approval-workflow-services",
    purpose: "Approval request routing, validation, and review workflow transitions.",
    dependencies: ["db"],
  },
  {
    name: "mobileMoneyService",
    filePath: "src/services/mobileMoneyService.ts",
    categoryId: "payment-integration-services",
    purpose: "Mobile money operations including C2B reconciliation, B2C disbursement, and STK flows.",
    dependencies: ["mobileMoneyProvider", "repaymentService", "loanLifecycleService", "auditService"],
  },
  {
    name: "mobileMoneyProvider",
    filePath: "src/services/mobileMoneyProvider.ts",
    categoryId: "payment-integration-services",
    purpose: "Provider API integration abstraction for mobile money channels.",
    dependencies: ["http-client"],
  },
  {
    name: "mobileMoneyRouteService",
    filePath: "src/routes/services/mobileMoneyRouteService.ts",
    categoryId: "payment-integration-services",
    purpose: "Mobile money API route composition and webhook registration.",
    dependencies: ["mobileMoneyService"],
  },
  {
    name: "repaymentService",
    filePath: "src/services/repaymentService.ts",
    categoryId: "payment-integration-services",
    purpose: "Repayment processing and repayment-linked ledger posting.",
    dependencies: ["loanService", "generalLedgerService", "penaltyEngine"],
  },
  {
    name: "auditService",
    filePath: "src/services/auditService.ts",
    categoryId: "utility-services",
    purpose: "Audit logging and audit entry persistence.",
    dependencies: ["prisma"],
  },
  {
    name: "documentStorageService",
    filePath: "src/services/documentStorageService.ts",
    categoryId: "utility-services",
    purpose: "Local and cloud document storage abstraction.",
    dependencies: ["fs", "s3", "logger"],
  },
  {
    name: "domainEventService",
    filePath: "src/services/domainEventService.ts",
    categoryId: "utility-services",
    purpose: "Domain event outbox persistence and broker publishing.",
    dependencies: ["message-queue", "logger", "db"],
  },
  {
    name: "errorTracker",
    filePath: "src/services/errorTracker.ts",
    categoryId: "utility-services",
    purpose: "Application error tracking adapter.",
    dependencies: ["logger"],
  },
  {
    name: "logger",
    filePath: "src/services/logger.ts",
    categoryId: "utility-services",
    purpose: "Structured application logging.",
    dependencies: ["console", "request-context"],
  },
  {
    name: "metricsService",
    filePath: "src/services/metricsService.ts",
    categoryId: "utility-services",
    purpose: "Prometheus-style application metrics collection.",
    dependencies: ["metrics-system"],
  },
  {
    name: "serviceRegistry",
    filePath: "src/services/serviceRegistry.ts",
    categoryId: "utility-services",
    purpose: "Application composition root for shared domain service instances reused across route stacks.",
    dependencies: ["accountingBatchService", "coaVersioningService", "fxRateService", "generalLedgerService", "loanLifecycleService", "loanProductCatalogService", "loanService", "loanUnderwritingService", "mobileMoneyService", "reportQueryService", "repaymentService", "suspenseAccountingService"],
  },
  {
    name: "pdfService",
    filePath: "src/services/pdfService.ts",
    categoryId: "utility-services",
    purpose: "Simple PDF document generation for exports.",
    dependencies: ["pdfkit-like-runtime"],
  },
  {
    name: "xlsxService",
    filePath: "src/services/xlsxService.ts",
    categoryId: "utility-services",
    purpose: "Workbook generation for tabular exports.",
    dependencies: ["xlsx-library-runtime"],
  },
  {
    name: "authSessionCache",
    filePath: "src/services/authSessionCache.ts",
    categoryId: "security-services",
    purpose: "Auth session caching with Redis or in-memory fallback.",
    dependencies: ["ioredis"],
  },
  {
    name: "passwordResetService",
    filePath: "src/services/passwordResetService.ts",
    categoryId: "security-services",
    purpose: "Password reset token issuance and delivery flow.",
    dependencies: ["prisma", "auditService", "email-or-webhook"],
  },
  {
    name: "tokenBlacklist",
    filePath: "src/services/tokenBlacklist.ts",
    categoryId: "security-services",
    purpose: "JWT invalidation and blacklist storage.",
    dependencies: ["redis", "logger"],
  },
  {
    name: "tokenRotationService",
    filePath: "src/services/tokenRotationService.ts",
    categoryId: "security-services",
    purpose: "Refresh token rotation and refresh session state management.",
    dependencies: ["redis", "jwt"],
  },
  {
    name: "rateLimitRedis",
    filePath: "src/services/rateLimitRedis.ts",
    categoryId: "security-services",
    purpose: "Redis-backed rate limiting helper and fallback handling.",
    dependencies: ["redis"],
  },
];

function getBackendServiceCatalog(): ServiceCatalogEntry[] {
  return BACKEND_SERVICE_CATALOG.map((entry) => ({
    ...entry,
    dependencies: [...entry.dependencies],
  }));
}

function getBackendServiceCategories(): ServiceCategory[] {
  return SERVICE_CATEGORIES.map((entry) => ({ ...entry }));
}

function getGroupedBackendServiceCatalog() {
  return SERVICE_CATEGORIES.map((category) => ({
    ...category,
    services: BACKEND_SERVICE_CATALOG
      .filter((entry) => entry.categoryId === category.id)
      .map((entry) => ({
        ...entry,
        dependencies: [...entry.dependencies],
      })),
  }));
}

export type {
  ServiceCategory,
  ServiceCategoryId,
  ServiceCatalogEntry,
};

export {
  getBackendServiceCatalog,
  getBackendServiceCategories,
  getGroupedBackendServiceCatalog,
};
