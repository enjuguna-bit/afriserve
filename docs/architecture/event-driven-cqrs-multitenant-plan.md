# Event-Driven, CQRS, and Multi-Tenant Transition Plan

## 1) Event-Driven Service Split

### Target service boundaries
- `loan-service`: loan origination, approvals, disbursements, repayment orchestration.
- `accounting-gl-service`: journal posting, trial balance, period close, snapshots.
- `notification-service`: SMS/email/WhatsApp/webhook communications.

### Contract-first event model
- `loan.disbursed`
- `loan.tranche_disbursed`
- `repayment.recorded`
- `loan.written_off`
- `loan.restructured`

Each event includes:
- `tenantId`
- `eventType`
- `aggregateType` and `aggregateId`
- `occurredAt`
- business payload

### Delivery model in this codebase
- Durable outbox table: `domain_events`.
- New service: `createDomainEventService`.
- Current producer hook: loan disbursement emits `loan.disbursed` / `loan.tranche_disbursed`.
- Broker adapters:
  - `EVENT_BROKER_PROVIDER=rabbitmq` (AMQP topic exchange)
  - `EVENT_BROKER_PROVIDER=kafka` (topic publish)
  - `EVENT_BROKER_PROVIDER=none` (no external broker; local outbox progression)

### Accounting decoupling rollout
1. Keep existing in-process GL posting as source of truth.
2. Dual-write event emission from loan workflows (already scaffolded).
3. Build `accounting-gl-service` consumer from the same event contracts.
4. Run shadow mode reconciliation (legacy GL write vs event-consumer GL write).
5. Cut over by disabling in-process GL posting path after parity is proven.

## 2) CQRS + Read Replica for Reporting

### Routing strategy
- Command path: unchanged, primary DB (`run/get/all`).
- Query path for reports: `reportGet/reportAll` routes to:
  - Postgres read replica via `DATABASE_READ_URL`, or
  - primary fallback when replica is not configured.

### Implemented in code
- `readGet/readAll` in DB layer.
- Report routes now prefer `reportGet/reportAll`.
- Existing APIs and response shapes remain unchanged.

### Operational guidance
- Start with async replica lag SLO <= 2s for operational dashboards.
- Keep critical “as-of-now” financial closing reports pinned to primary until lag monitoring is stable.
- Track replica lag and cache hit ratio in observability dashboards.

## 3) Multi-Tenant SaaS Architecture

### Recommended model
- Postgres with row-level tenant isolation (`tenant_id` on business tables + RLS policies).
- Keep one shared deployment first; add schema-per-tenant only for outlier institutions that require hard data segmentation.

### Tenant primitives added
- `tenants` table.
- `domain_events.tenant_id` for tenant-safe event streams.
- `DEFAULT_TENANT_ID` environment control for single-tenant compatibility.

### Next DB migration phases
1. Add `tenant_id` to core tables (`clients`, `loans`, `repayments`, `gl_journals`, `users`, etc).
2. Backfill existing data to `default`.
3. Add RLS policies and enforce session-scoped tenant context.
4. Add tenant-aware unique constraints (for example: `(tenant_id, email)`).
5. Add tenant onboarding/offboarding automation.

Use the SQL starter in `docs/sql/postgres-tenant-rls.sql`.

## 4) End-to-End Data Flow Examples

These examples document the current application behavior first and then call out where the event-driven / CQRS transition changes the flow.

### 4.1 Loan Origination to Repayment

Before the detailed step-by-step flow, keep one important distinction in mind:

```text
Standard origination approval
  pending_approval loan -> direct checker approval -> approved -> disbursed

High-risk lifecycle approval request
  active loan mutation request -> approval_request pending -> checker review -> execute mutation
```

```text
1. Client Registration
   - Route: POST /api/clients
   - Writes: create client record with kyc_status = pending and onboarding_status = registered
   - Side effects: audit trail entry for client creation
   - Read model impact: client and dashboard report caches become stale

2. KYC Review and Client Readiness
   - Routes: POST /api/clients/:id/kyc or PATCH /api/clients/:id/kyc
   - Status path: pending -> in_review -> verified | rejected | suspended
   - Writes: client KYC fields, review metadata, audit trail
   - Important invariant: verified KYC alone is not enough for loan readiness in the current codebase
   - Additional readiness blockers cleared in parallel flows:
     - attach guarantor(s)
     - attach collateral asset(s)
     - record onboarding fee payment
   - Read model impact: invalidate report caches and refresh client onboarding snapshots

3. Loan Origination
   - Route: POST /api/loans
   - Services: loanService + loanWorkflowSnapshotService + loanUnderwritingService
   - Preconditions:
     - client must be ready_for_loan_application
     - scope / hierarchy visibility must allow the operator to act on the client
     - product and underwriting checks must pass
   - Writes:
     - create loan in pending_approval
     - create installment schedule
     - create initial loan contract snapshot with event_type = creation
     - create audit entry
   - Transition note: this is still a command-path write on the primary database

4. Loan Approval Decision
   - Route: POST /api/loans/:id/approve
   - Services: loanLifecycleService + approvalWorkflowService
   - Preconditions:
     - maker-checker must pass unless an allowed administrative override is in effect
     - if REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL=true, KYC must be verified at approval time
   - Writes:
     - update loan status from pending_approval to approved
     - persist audit entry for approval
   - Important correction: standard loan approval is a direct approval action on the loan; the separate approval_requests workflow is mainly used for high-risk lifecycle mutations such as restructure, refinance, top-up, term extension, and write-off

4A. High-Risk Lifecycle Mutation Request
   - Routes:
     - POST /api/loans/:id/write-off
     - POST /api/loans/:id/restructure
     - POST /api/loans/:id/top-up
     - POST /api/loans/:id/refinance
     - POST /api/loans/:id/extend-term
     - POST /api/approval-requests/:id/approve
     - POST /api/approval-requests/:id/reject
   - Services: loanLifecycleService + approvalWorkflowService
   - Preconditions:
     - loan must already be in a state where the requested mutation makes business sense
     - branch scope, checker role, and maker-checker constraints must pass
   - Writes on request submission:
     - create approval_requests row with status = pending
     - persist audit entry for request submission
   - Writes on checker decision:
     - reject path updates approval request status and review metadata only
     - approve path executes the requested mutation inside the transaction, then stamps executed_at after successful completion
   - Important invariant: the approval request record is not itself the business mutation; it is the review and execution envelope for the real loan-state change

5. Loan Disbursement
   - Routes: POST /api/loans/:id/disburse and tranche-aware disbursement handlers
   - Services: loanLifecycleService + generalLedgerService + domainEventService
   - Writes:
     - create one or more loan_disbursement_tranches
     - move loan to active when the funding path is complete
     - stamp disbursed_at
     - create loan contract snapshot with event_type = disbursement_tranche or disbursement
     - create GL journal entries for principal movement
     - create audit entry
   - Event flow:
     - persist domain event to domain_events outbox
     - current default is local outbox progression; external broker delivery remains a transition target
   - Optional integration: create outbound mobile money B2C request when disbursement uses a provider channel

6. Ongoing Interest and Delinquency Management
   - Services: interestAccrualEngine + accountingBatchService + loanWorkflowSnapshotService
   - Current model:
     - upfront products recognize contractual interest at origination
     - daily_eod products defer and accrue interest during end-of-day processing
   - Writes:
     - interest accrual rows / journal effects when configured
     - refreshed workflow snapshot and arrears indicators
   - Important invariant: overdue and arrears views are derived from due_date plus outstanding amounts, not only from persisted installment status text

7. Repayment Capture
   - Routes:
     - POST /api/loans/:id/repayments for manual or assisted repayment
     - POST /api/mobile-money/c2b/webhook for inbound provider receipts
     - POST /api/mobile-money/c2b/events/:id/reconcile for manual matching of unmatched receipts
   - Services: repaymentService + mobileMoneyService + loanLifecycleService + generalLedgerService
   - Preconditions:
     - loan must be in a repayable state such as active or restructured
     - duplicate external receipts must be rejected idempotently
   - Writes:
     - create repayment record with channel / provider / external receipt metadata when available
     - allocate funds to oldest due installments first
     - update installment paid amounts and derived installment states
     - update loan repaid_total and outstanding balance state
     - create GL journal entries for cash / receivable movement and related income recognition as configured
     - create audit entry
     - persist repayment.recorded domain event to outbox
   - Mobile money branch:
     - unmatched C2B receipts are stored for later reconciliation instead of being dropped

8. Fully Paid, Matured, Written Off, or Restructured Outcomes
   - Fully paid path:
     - when outstanding reaches zero and installments reconcile, the loan is operationally complete
     - contract history remains available through loan_contract_versions
     - archive / close semantics can remain a later explicit action depending on workflow
   - Matured but unpaid path:
     - lifecycle reporting marks the loan as matured_unpaid based on due dates and outstanding balance
   - High-risk mutation path:
     - restructure / top-up / refinance / term extension / write-off create approval_requests
     - checker approval does not end the flow by itself; the mutation must execute successfully, then approval_requests.executed_at is stamped
   - Transition note:
     - the future accounting-gl-service should consume the same outbox events instead of relying on the current in-process GL posting path
```

### 4.2 Report Generation, Caching, and Export

```text
1. Request Intake
   - Routes: /api/reports/* and portfolio-specific report endpoints
   - Preconditions:
     - authenticate user
     - authorize report access by role
     - resolve hierarchy scope (HQ / region / branch / assigned officer visibility)
     - normalize filters such as date range, branch, officer, format, and pagination

2. Cache Key Resolution
   - Service: reportCacheService
   - Key shape: report namespace + report name + role/scope context + normalized filters
   - Behavior:
     - return cached payload on hit
     - deep-clone cached data before returning to avoid mutation leaks
     - skip caching when disabled by configuration

3. Query Execution
   - Service: reportQueryService
   - Data access path:
     - prefer readGet / readAll when a read replica is configured
     - fall back to the primary database when DATABASE_READ_URL is not configured or when a report must stay strongly consistent
   - Query logic:
     - apply hierarchy and scope filters first
     - join related tables for client, loan, installment, branch, officer, and accounting views
     - derive operational metrics such as arrears, aging, collections, officer performance, and board-summary KPIs
     - preserve compatibility with legacy report templates where required
   - Important invariant: some financial-close style reports should remain pinned to the primary database until replica lag observability is mature

4. Cache Fill and Invalidation Strategy
   - On cache miss:
     - compute the payload
     - store it with TTL in memory or Redis
   - Invalidators already present in the codebase clear report caches after mutations to:
     - clients and KYC state
     - loans, disbursements, repayments, restructures, and write-offs
     - collateral / guarantor attachments
     - collection actions
     - branch and hierarchy changes
   - Transition note: cache metrics and replica lag should become first-class observability signals during CQRS rollout

5. Response Formatting and Export
   - Service: reportExportService
   - Formats:
     - JSON for API-native responses
     - CSV for flat exports
     - XLSX for workbook-based exports
     - PDF for presentation-friendly exports
   - Response behavior:
     - set Content-Type and Content-Disposition correctly
     - return pagination metadata for API responses when the report shape supports paging
     - stream large exports where practical instead of materializing unnecessary copies

6. Downstream Consumers
   - Dashboard screens consume JSON payloads directly
   - Scheduled reporting reuses the same report query and export services for asynchronous delivery
   - Future state:
     - read models can become more aggressively pre-computed once event consumers and tenant-aware replicas are in place
```

### 4.3 Daily Interest and Penalty Accrual

```text
1. Scheduler / Batch Entry Point
   - Current execution paths:
     - accountingBatchService.runBatch({ batchType: 'eod' }) for end-of-day accounting runs
     - overdueSync background job for overdue synchronization, penalty charging, and interest-accrual compatibility runs
   - Important correction: this is not one flat loop in a route handler; accrual logic runs in dedicated engines and may be triggered by different background orchestration paths

2. Interest Accrual Candidate Selection
   - Service: interestAccrualEngine
   - Candidates:
     - only loans with loan_interest_profiles.accrual_method = daily_eod
     - only loans in active or restructured state
     - only profiles where total_contractual_interest > accrued_interest
   - Batch behavior:
     - scans in pages of 500 loans
     - resolves required GL accounts before starting

3. Interest Accrual Calculation and Idempotency
   - For each candidate loan:
     - derive accrual window from accrual_start_at or disbursed_at through maturity_at
     - calculate target accrued interest based on elapsed UTC days across the contractual term
     - compute delta between target accrued interest and already-accrued interest
     - cap the delta so it never exceeds remaining contractual interest
   - Double-accrual protection:
     - transaction checks loan_interest_accrual_events for the same loan_id + accrual_date
     - if an event already exists for that day, the engine skips the loan

4. Interest Accrual Writes
   - Transaction updates:
     - loan_interest_profiles.accrued_interest
     - loan_interest_profiles.last_accrual_at
     - loan_interest_accrual_events row for the accrual date
     - transactions row with tx_type = interest_accrual
     - GL journal and entries debiting UNEARNED_INTEREST and crediting INTEREST_INCOME
   - Important invariant:
     - daily interest accrual updates the interest profile and accounting records; it is not the same thing as penalty charging and does not follow the same installment mutation path

5. Penalty Candidate Selection
   - Service: penaltyEngine
   - Candidates:
     - only overdue installments
     - only loans in active or restructured state
     - only installments with remaining outstanding amount
     - only installments or products with positive daily rate or flat penalty settings
   - Batch behavior:
     - scans in pages of 500 installments using installment id progression
     - resolves required GL accounts before starting

6. Penalty Calculation Rules
   - For each overdue installment:
     - read installment-level overrides first, then fall back to loan product penalty settings
     - respect penalty_grace_days before charging
     - calculate penalty from one of three bases:
       - installment_outstanding
       - principal_outstanding
       - full_balance
     - apply either simple or compound growth based on penalty_compounding_method
     - apply flat penalty once when grace has elapsed and no previous penalty has been accrued
     - enforce the smaller effective ceiling from penalty_cap_amount and penalty_cap_percent_of_outstanding when configured

7. Penalty Writes
   - Transaction updates:
     - loan_installments.amount_due
     - loan_installments.penalty_amount_accrued
     - loan_installments.penalty_last_applied_at
     - loans.expected_total and loans.balance
     - transactions row with tx_type = penalty_charge
     - GL journal and entries debiting LOAN_RECEIVABLE and crediting PENALTY_INCOME

8. Observability and Cache Behavior
   - Both engines emit background-task metrics summaries
   - Missing GL account configuration causes the run to warn and skip rather than partially posting
   - Important correction:
     - report-cache invalidation is a common mutation concern across the app, but these batch engines do not directly call invalidateReportCaches in the current implementation
     - if accrual-sensitive reports are cached aggressively, cache refresh should be handled by the surrounding scheduler/orchestration layer or an explicit follow-on invalidation step
```

### 4.4 Hierarchy Scope Filtering

```text
1. Request Entry
   - User requests a report, branch-scoped read, or domain action
   - Authentication establishes identity
   - Authorization confirms the user can access the feature

2. Scope Resolution
   - Service: hierarchyService.resolveHierarchyScope(user)
   - Current role mapping in code:
     - admin / ceo / finance / it -> HQ scope
     - operations_manager / loan_officer / cashier -> single-branch scope
     - area_manager -> region scope backed by assigned branch ids
     - investor / partner -> branch-scoped assignment set backed by assigned branch ids
   - Important correction:
     - area managers are not filtered only by a plain region predicate in the SQL layer; the service resolves active assigned branch ids first, then builds SQL from those branch ids

3. Scope Object Produced
   - Scope contains:
     - level
     - role
     - branchIds
     - branchId when there is a single effective branch
     - regionId when derivable from assignment context
   - Scope resolution is cached briefly in memory per user + role using HIERARCHY_CACHE_TTL_MS

4. SQL Filter Construction
   - Service: hierarchyService.buildScopeCondition(scope, branchColumnRef)
   - Current behavior:
     - HQ scope -> no WHERE restriction added
     - empty non-HQ branch list -> SQL becomes 1 = 0
     - one branch id -> branchColumnRef = ?
     - many branch ids -> branchColumnRef IN (?, ?, ...)
   - Helper methods:
     - addScopeFilter appends SQL and params to query builders
     - isBranchInScope validates one resource branch against the resolved scope
     - projectBranchIdsToScope intersects arbitrary branch lists with the user scope

5. Query and Cache Interaction
   - Reporting and operational queries apply scope before executing reads
   - Report cache keys should include role and normalized scope context so two users with different branch visibility do not share the same payload
   - Important correction:
     - the logical rule is not simply "region user means WHERE branch.region_id = ?"
     - the durable rule is "resolve active branch visibility first, then build SQL from that visibility set"

6. Failure Modes the Code Guards Against
   - branch-scoped roles without an assigned branch are rejected
   - inactive assigned branches are rejected
   - area managers spanning more than one region are rejected
   - non-HQ scopes with no active branch assignments are rejected
```

### 4.5 Design Corrections Captured by These Flows

- Loan approval is not the same thing as the separate `approval_requests` workflow; direct approval is used for standard origination, while approval requests drive higher-risk lifecycle changes.
- Client readiness for loan origination is broader than KYC and currently includes guarantor, collateral, and onboarding-fee readiness checks.
- Repayment posting must handle manual and mobile money paths, idempotent receipt reconciliation, installment allocation, ledger impact, and report-cache invalidation as one logical flow.
- Report generation is already partly CQRS-ready because it can use a read replica, but strong-consistency reports and cache invalidation still depend on the primary command path.
- Interest accrual and penalty charging are separate engine flows with different candidate rules, data mutations, and GL effects; do not document them as one generic accrual loop.
- Hierarchy filtering is driven by resolved active branch visibility, with SQL conditions built from branch ids rather than relying on a single role-to-region predicate shortcut.

## 5) Database Indexes and Performance

The current codebase uses two layers of indexing strategy:

- schema-level indexes declared in Prisma for portable foreign-key and reporting access paths
- SQLite runtime indexes created in `src/db/schema.ts` for report-heavy local deployments and test databases

The goal is to keep the high-volume operational reads fast without pretending every column needs its own standalone index.

### 5.1 Canonical Query Hot Paths

```text
Loan queries
  - by client, branch, officer, and status
  - pending-approval queues filtered by created_at windows
  - disbursement history sorted by branch_id + disbursed_at

Client queries
  - by branch roster and created_at recency
  - by officer assignment
  - by kyc_status / onboarding_status / fee_payment_status

Repayment and installment queries
  - repayments by paid_at and loan_id + paid_at
  - due / arrears lookups by loan_id + status + due_date
  - aging scans by due_date + status + loan_id

User and hierarchy queries
  - role-based user lists and active admin checks
  - branch-scoped loan-officer summaries

GL queries
  - journals by reference_type + reference_id, loan_id, client_id, and branch_id
  - entries by journal_id and account_id
  - balance snapshots by snapshot_date, account_id, branch_id, and currency
```

### 5.2 Key Indexes in the Current Implementation

```text
Loans
  - loans(client_id)
  - loans(product_id)
  - loans(branch_id)
  - loans(officer_id)
  - loans(status)
  - loans(created_at)
  - loans(branch_id, status)
  - loans(branch_id, disbursed_at)
  - loans(created_by_user_id, disbursed_at)

Users
  - users(branch_id)
  - users(primary_region_id)
  - users(role, is_active)

Clients
  - clients(branch_id)
  - clients(officer_id)
  - clients(created_by_user_id)
  - clients(kyc_status)
  - clients(onboarding_status)
  - clients(fee_payment_status)
  - clients(branch_id, created_at)

Repayments and installments
  - repayments(loan_id)
  - repayments(paid_at)
  - repayments(loan_id, paid_at)
  - repayments(recorded_by_user_id, paid_at)
  - loan_installments(loan_id)
  - loan_installments(loan_id, status, due_date)
  - loan_installments(due_date, status, loan_id)

GL and accounting
  - gl_journals(reference_type, reference_id) as a unique lookup constraint
  - gl_journals(loan_id)
  - gl_journals(client_id)
  - gl_journals(branch_id)
  - gl_entries(journal_id)
  - gl_entries(account_id)
  - gl_balance_snapshots(snapshot_date, account_id, branch_id, currency) as a unique reporting key
  - gl_balance_snapshots(snapshot_date)
  - gl_balance_snapshots(account_id)
  - gl_balance_snapshots(branch_id)
```

### 5.3 Performance Notes

- The report-specific composite indexes matter more than isolated single-column indexes because the hot queries usually filter and sort across multiple dimensions.
- `clientReadRepository` now uses direct equality predicates for normalized status columns so `clients(kyc_status)`, `clients(onboarding_status)`, and `clients(fee_payment_status)` can be used by the planner.
- SQLite local/test environments rely on `ensureSqliteReportIndexes()` for these extra hot-path indexes; PostgreSQL parity should be maintained through Prisma migrations, not by assuming runtime bootstrap will cover it.
- `tests/report-query-indexes.test.ts` is the regression guard for the SQLite report index set. When query shapes change, update both the schema/bootstrap indexes and the test together.
- Indexes should follow real query predicates. For example, `users(role)` by itself is less aligned with the current workload than `users(role, is_active)`, because admin-count and operator-list paths commonly filter both.
