# Service Directory & Dependencies

This document describes the current backend service directory in `src/services/` and the direct dependencies used in code today.

Source of truth:
- `src/config/serviceCatalog.ts`

The goal is to keep this document aligned with the actual repo rather than an aspirational architecture diagram.

## 13.0 Runtime Relationship Map

The current backend is best understood as a layered runtime graph rather than a flat list of services.

```text
Frontend / API Consumer
	|
	v
Express API Gateway
	|
	+--> authenticate -> JWT/session identity
	|
	+--> authorize / RBAC policy -> role + permission gate
	|
	+--> hierarchy scope checks -> branch / region / HQ visibility
	|
	v
Route Orchestration Modules
  - loanRouteService
  - loanExecutionRouteService
  - loanApprovalRequestRouteService
  - collectionManagementRouteModule
  - userManagementRouteModule
  - branchManagementRouteModule
  - mobileMoneyRouteService
	|
	v
Shared Composition Root
  - serviceRegistry / createAppServiceRegistry
	|
	+--> Loan domain services
	|     - loanService
	|     - loanLifecycleService
	|     - repaymentService
	|     - loanUnderwritingService
	|
	+--> Reporting / accounting services
	|     - reportQueryService
	|     - generalLedgerService
	|     - suspenseAccountingService
	|     - accountingBatchService
	|
	+--> Integration services
	      - mobileMoneyService
	      - domainEventService
	|
	v
Cross-Cutting Runtime Capabilities
  - auditService
  - reportCacheService / authSessionCache / tokenBlacklist
  - metricsService / logger / errorTracker
  - permissionService / userRoleService
	|
	v
Persistence and External Infrastructure
  - Prisma / db access
  - SQLite or PostgreSQL
  - Redis-backed cache / rate limit / auth state
  - domain_events outbox / queue adapters
  - mobile money provider APIs
```

### 13.0.1 Dependency Rules That Matter

- Authentication establishes identity first; authorization and hierarchy scope resolution then determine which routes and records are reachable.
- Route modules should orchestrate HTTP concerns and delegate domain decisions to shared services created by `serviceRegistry`.
- `hierarchyService` is a shared guardrail across loan, report, branch, user, and collection paths, so scope filtering is not isolated to one domain.
- `loanLifecycleService` is the main mutation orchestrator for approvals, disbursement, and high-risk lifecycle changes; `approvalWorkflowService` supports queued approval-request state rather than replacing normal loan approval.
- Mutation-heavy services depend on cross-cutting side effects such as `auditService`, report-cache invalidation, and optional domain-event publishing.
- Reporting depends on both scope enforcement and cache behavior, so mutations in loans, clients, branches, and collections must be treated as report invalidators.
- `mobileMoneyService` is not a standalone payment island; it composes with `repaymentService` and `loanLifecycleService` so provider callbacks affect loan state, repayment state, and accounting state together.

## 13.1 Loan Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `loanLifecycleService` | Core loan state management for approvals, disbursement, restructuring, write-off, and high-risk review. | `approvalWorkflowService`, `generalLedgerService`, `loanWorkflowSnapshotService`, `hierarchyService`, `domainEventService` |
| `loanService` | Loan creation and core CRUD-style mutations with scope and onboarding checks. | `prisma`, `hierarchyService`, `loanWorkflowSnapshotService`, `loanUnderwritingService`, `loanProductCatalogService` |
| `loanProductCatalogService` | Loan product lookup and active-product resolution used by loan creation flows. | `db` |
| `loanRouteService` | Loan API composition layer that wires route handlers to domain services. | `serviceRegistry`, `hierarchyService` |
| `loanApprovalRequestRouteService` | Approval workflow routes for reviewing queued high-risk loan lifecycle requests. | `loanLifecycleService`, `hierarchyService` |
| `loanExecutionRouteService` | Disbursement, repayment, restructure, refinance, and term-extension route handlers. | `loanLifecycleService`, `repaymentService`, `mobileMoneyService`, `hierarchyService` |
| `loanCollateralRouteService` | Collateral and guarantor linkage routes for loans. | `loanService`, `hierarchyService` |
| `loanPortfolioRouteService` | Portfolio analytics and loan dashboard route handlers. | `reportQueryService`, `loanWorkflowSnapshotService`, `hierarchyService` |
| `loanProductRouteService` | Loan product configuration routes and validation flows. | `loanService` |
| `loanStatementRouteService` | Loan statement and payment schedule endpoints. | `loanService`, `loanWorkflowSnapshotService`, `reportQueryService` |
| `loanWorkflowSnapshotService` | Workflow and onboarding snapshot helpers for client and loan readiness state. | `db` |
| `loanUnderwritingService` | Loan assessment refresh, underwriting signals, and risk-state support. | `prisma`, `auditService` |

## 13.2 Report Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `reportQueryService` | Scoped report query execution and cached report composition. | `hierarchyService`, `prisma`, `reportCacheService`, `serviceRegistry` |
| `reportCacheService` | Memory or Redis-backed caching for report payloads. | `ioredis`, `metricsService`, `logger` |
| `reportExportService` | Tabular export formatting for CSV, PDF, XLSX, and JSON passthrough. | `pdfService`, `xlsxService` |
| `scheduledReportService` | Scheduled report generation and export payload assembly. | `prisma`, `reportExportService` |
| `legacyReportTemplateService` | Legacy report template compatibility for older export contracts. | `reportQueryService` |

## 13.3 Collection Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `collectionRouteService` | Collection API registration entry point. | `collectionManagementRouteModule` |
| `collectionManagementRouteModule` | Collection workflow route orchestration module. | `collectionOverdueRouteModule`, `collectionSummaryRouteModule`, `collectionActionMutationRouteModule` |
| `collectionOverdueRouteModule` | Overdue tracking and delinquency views for collections. | `reportQueryService` |
| `collectionSummaryRouteModule` | Collection analytics and summary reporting routes. | `reportQueryService` |
| `collectionActionMutationRouteModule` | Collection action creation and update flows. | `hierarchyService`, `auditService` |

## 13.4 Hierarchy & Branch Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `hierarchyService` | Hierarchy scope resolution, branch visibility checks, and assignment utilities. | `prisma` |
| `hierarchyEventService` | Hierarchy change tracking and event persistence. | `prisma` |
| `branchManagementRouteModule` | Branch read, mutation, and reporting route orchestration. | `branchReadRouteModule`, `branchMutationRouteModule`, `branchReportRouteModule` |
| `branchReadRouteModule` | Branch listing, detail reads, and hierarchy-aware branch visibility routes. | `hierarchyService` |
| `branchMutationRouteModule` | Branch create, update, deactivate, and delete workflow routes. | `hierarchyService`, `hierarchyEventService`, `auditService` |
| `branchReportRouteModule` | Branch reporting routes and hierarchy-aware summary views. | `reportQueryService`, `hierarchyService` |

## 13.5 Accounting Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `generalLedgerService` | General ledger journal posting and account movement recording. | `prisma`, `decimal.js` |
| `interestAccrualEngine` | Interest accrual calculation and periodic journal staging. | `db`, `metricsService`, `logger` |
| `penaltyEngine` | Penalty charge calculation and overdue penalty application. | `db`, `metricsService`, `logger` |
| `suspenseAccountingService` | Suspense transaction management, FX normalization, and accounting reconciliation. | `generalLedgerService`, `fxRateService` |
| `accountingBatchService` | Batch accounting runs for accrual, close, and periodic processing. | `generalLedgerService`, `interestAccrualEngine`, `logger` |
| `coaVersioningService` | Chart of accounts versioning and lifecycle management. | `prisma` |
| `fxRateService` | FX rate storage, lookup, and optional remote rate resolution. | `db`, `logger`, `http-client` |

## 13.6 User & Permission Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `userRouteService` | User CRUD and administration route wiring. | `userManagementRouteModule`, `userRoleService`, `hierarchyService`, `permissionService` |
| `userManagementRouteModule` | User workflow route orchestration for reads and account actions. | `userReadRouteModule`, `userAccountActionRouteModule` |
| `userReadRouteModule` | User listing, summary, role catalog, and security-state read routes. | `hierarchyService`, `permissionService` |
| `userAccountActionRouteModule` | User account mutation workflows for profile, roles, permissions, activation, and security actions. | `hierarchyService`, `permissionService`, `auditService`, `domainEventService` |
| `userRoleService` | Role assignment normalization, persistence, and multi-role resolution. | `db`, `roles-config` |
| `permissionService` | Permission catalog, effective permission resolution, and runtime checks. | `db`, `userRoleService` |

## 13.7 Approval Workflow Service

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `approvalWorkflowService` | Approval request routing, validation, and review workflow transitions. | `db` |

## 13.8 Payment & Integration Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `mobileMoneyService` | Mobile money operations including C2B reconciliation, B2C disbursement, and STK flows. | `mobileMoneyProvider`, `repaymentService`, `loanLifecycleService`, `auditService` |
| `mobileMoneyProvider` | Provider API integration abstraction for mobile money channels. | `http-client` |
| `mobileMoneyRouteService` | Mobile money API route composition and webhook registration. | `mobileMoneyService` |
| `repaymentService` | Repayment processing and repayment-linked ledger posting. | `loanService`, `generalLedgerService`, `penaltyEngine` |

## 13.9 Utility Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `auditService` | Audit logging and audit entry persistence. | `prisma` |
| `documentStorageService` | Local and cloud document storage abstraction. | `fs`, `s3`, `logger` |
| `domainEventService` | Domain event outbox persistence and broker publishing. | `message-queue`, `logger`, `db` |
| `errorTracker` | Application error tracking adapter. | `logger` |
| `logger` | Structured application logging. | `console`, `request-context` |
| `metricsService` | Prometheus-style application metrics collection. | `metrics-system` |
| `serviceRegistry` | Application composition root for shared domain service instances reused across route stacks. | `accountingBatchService`, `coaVersioningService`, `fxRateService`, `generalLedgerService`, `loanLifecycleService`, `loanProductCatalogService`, `loanService`, `loanUnderwritingService`, `mobileMoneyService`, `reportQueryService`, `repaymentService`, `suspenseAccountingService` |
| `pdfService` | Simple PDF document generation for exports. | `pdfkit-like-runtime` |
| `xlsxService` | Workbook generation for tabular exports. | `xlsx-library-runtime` |

## 13.10 Security Services

| Service | Purpose | Direct Dependencies |
|---------|---------|---------------------|
| `passwordResetService` | Password reset token issuance and delivery flow. | `prisma`, `auditService`, `email-or-webhook` |
| `tokenBlacklist` | JWT invalidation and blacklist storage. | `redis`, `logger` |
| `tokenRotationService` | Refresh token rotation and refresh session state management. | `redis`, `jwt` |
| `rateLimitRedis` | Redis-backed rate limiting helper and fallback handling. | `redis` |
| `authSessionCache` | Auth session caching with Redis or in-memory fallback. | `ioredis` |

## 13.11 Relationship Hotspots

These are the system joins where one section of the application materially depends on another.

### 13.11.1 Auth, RBAC, and Scope

- Auth and permission checks gate route entry before domain services run.
- Hierarchy scope is applied again inside domain and reporting services, so access control is intentionally layered rather than trusting route middleware alone.

### 13.11.2 Loan Domain and Approval Workflows

- Standard origination approval uses `loanLifecycleService.approveLoan` directly from `/api/loans/:id/approve`.
- Queued `approval_requests` are used for higher-risk lifecycle mutations such as write-off, restructure, top-up, refinance, and term extension.
- `approval_requests.executed_at` should only be stamped after the approved action actually executes successfully.

### 13.11.3 Loan, Repayment, Accounting, and Mobile Money

- Disbursement and repayment flows are not isolated from accounting; they post through `generalLedgerService` and related accounting services.
- Mobile money disbursement and reconciliation paths reuse the same core loan and repayment services, which keeps ledger and loan-state transitions consistent across manual and provider-driven channels.

### 13.11.4 Reporting, Cache, and Mutations

- `reportQueryService` sits downstream of loans, clients, collections, branches, and accounting data.
- Report cache correctness therefore depends on mutation services invalidating cached views whenever operational state changes.
- The reporting path is CQRS-ready in places, but write services remain the source of truth for cache invalidation and consistency boundaries.

## 13.12 Critical Flow Split: Standard Approval vs Queued Approval Request

```text
Standard loan origination path

POST /api/loans
	-> loanService validates client readiness, scope, product, and underwriting
	-> loan created in pending_approval
	-> workflow snapshot and audit trail updated

POST /api/loans/:id/approve
	-> loanLifecycleService performs maker-checker validation
	-> optional verified-KYC invariant enforced when configured
	-> loan status updated to approved

POST /api/loans/:id/disburse
	-> loanLifecycleService or mobileMoneyService executes funding
	-> GL posting, contract versioning, audit logging, cache invalidation, domain events
```

```text
High-risk lifecycle mutation path

POST /api/loans/:id/restructure | /write-off | /top-up | /refinance | /extend-term
	-> loanLifecycleService validates state and scope
	-> approvalWorkflowService creates pending approval_request
	-> audit trail records request submission

POST /api/approval-requests/:id/approve or reject
	-> checker role and maker-checker constraints enforced
	-> on reject: request closed, underlying loan unchanged
	-> on approve: requested mutation executes inside transaction
	-> executed_at stamped only after successful execution
	-> audit trail, cache invalidation, and downstream side effects follow executed mutation
```

## Notes

- This document records direct dependencies that are visible in the current code, not every transitive dependency.
- Several services are route orchestration modules rather than pure domain services. Their dependencies reflect the modules or handlers they compose.
- The catalog intentionally includes both internal service dependencies and important infrastructure dependencies such as `prisma`, `redis`, `db`, and `http-client`.
- Shared service creation for the loan domain now lives in `serviceRegistry`, so route composition can reuse bootstrap-created instances instead of constructing them inline.
- Shared report and GL composition now also flows through `serviceRegistry`, so reportRoutes and glReports reuse the same cache-aware query and accounting service instances.
- If service wiring changes, update `src/config/serviceCatalog.ts` first and then refresh this document.