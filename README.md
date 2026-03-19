# Microfinance System (MVP)

This project is a minimal microfinance system with:

- Backend API (Express + SQLite)
- Role-based authentication (JWT)
- Basic browser dashboard (served from backend)

## Features

- User authentication with roles (`admin`, `ceo`, `finance`, `investor`, `partner`, `operations_manager` (branch manager), `it`, `area_manager`, `loan_officer`, `cashier`)
- Admin user lifecycle controls (create, profile update, role allocation, activation, deactivation, unlock, session revoke)
- Three-tier hierarchy model: HQ -> Regions -> Branches (pre-seeded for Kenya)
- Branch administration module (create, update, deactivate, hierarchy tree)
- Hierarchy-scoped access control for users, clients, loans, collections, transactions, and reports
- Role-aware assignment fields (`branchId`, `branchIds`, `primaryRegionId`) for user provisioning
- Hierarchy event stream with audit logging for branch/user assignment changes
- Client registration and listing
- Client data integrity safeguards (unique national ID, active/inactive status, update timestamp trail)
- Client KYC lifecycle (`pending`, `verified`, `rejected`) with approval gate support
- Loan creation and tracking
- Loan lifecycle management (`active`, `restructured`, `written_off`, `closed`)
- Automatic installment schedule generation per loan
- Weekly repayment schedules
- Fixed loan pricing: 20% annual simple interest pro-rated by `termWeeks`, KSh 200 one-time registration fee, KSh 500 processing fee per loan
- Loan repayments
- Transaction recording (disbursements + repayments)
- Multipart client document uploads (`photo`, `id_document`) with local or S3-compatible storage
- Portfolio summary report with overdue installment visibility
- Automatic overdue installment status synchronization

## Tech Stack

- Node.js + Express
- SQLite (`better-sqlite3`) or PostgreSQL (`pg`)
- Zod for validation
- JWT (`jsonwebtoken`)
- Password hashing (`bcryptjs`)

## Architecture Docs

- `docs/architecture/system-relationship-overview.md` for the canonical system-level dependency map and section relationships
- `docs/architecture/service-directory-dependencies.md` for service-to-service dependency details
- `docs/architecture/api-route-structure.md` for canonical API route structure
- `docs/architecture/event-driven-cqrs-multitenant-plan.md` for end-to-end flow and transition planning
- `docs/deployment/azure.md` for the recommended Azure production deployment shape for this repo

## Frontend maintainability roadmap

The browser dashboard currently runs as a large vanilla JS/CSS/HTML surface for delivery speed. To keep future changes safer, use an incremental modularization plan instead of a full rewrite.

Suggested module boundaries:

- `auth` (login, reset, session state)
- `dashboard-overview` (portfolio, transactions, auto-refresh)
- `operations` (clients/loans/repayments)
- `collections` (queues/actions/alerts)
- `reports` (reports hub and exports)
- `admin-system` (users/branches/audit/system diagnostics)

Incremental approach:

1. Extract shared helpers first (`api`, formatters, DOM utilities, validation helpers).
2. Move one feature slice at a time to a module (no behavior change per step).
3. Keep interface contracts stable via small module init functions (for example `initOverviewModule(ctx)`).
4. Add lightweight smoke tests for critical flows after each extraction.
5. Optionally adopt Web Components, Alpine.js, Lit, or Preact once modules are stable.

This keeps the existing UI working while reducing coupling and onboarding complexity.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create local environment file:

  ```bash
  copy .env.example .env
  ```

  Then set values in `.env` (especially `JWT_SECRET`).
  Optional:
  - `JWT_SECRETS` comma-separated signing/verification secrets (first secret is used for new tokens, all listed secrets are accepted for verification)
  - `AUTH_TOKEN_STORE_REDIS_URL` Redis URL for refresh-token rotation + JWT blacklist state
  - `AUTH_SESSION_CACHE_REDIS_URL` Redis URL for JWT session user lookup cache (falls back to in-memory when unset)
  - `AUTH_SESSION_CACHE_TTL_SECONDS` auth session cache TTL in seconds (default: `60`)
  - `RATE_LIMIT_REDIS_URL` Redis URL for distributed API/auth rate limiting (falls back to in-memory when unset)
  - `TRUST_PROXY=true` to trust one reverse-proxy hop for accurate client IP extraction (`req.ip`)
  - `API_BASE_URL` optional base URL used in generated OpenAPI server metadata
  - `LOG_LEVEL` structured log level (`debug`, `info`, `warn`, `error`; default `info`)
  - `LOG_SHIPPER_ENABLED=true` to forward JSON logs to an HTTP collector
  - `LOG_SHIPPER_URL` log collector ingestion URL (`http(s)://...`)
  - `LOG_SHIPPER_AUTH_TOKEN` optional bearer token for log shipper auth
  - `LOG_SHIPPER_MIN_LEVEL` minimum level sent to shipper (`debug`, `info`, `warn`, `error`; default `warn`)
  - `LOG_SHIPPER_TIMEOUT_MS` HTTP timeout for log shipping (default `3000`)
  - `SENTRY_DSN` Sentry DSN for error tracking (requires `@sentry/node` installed)
  - `SENTRY_TRACES_SAMPLE_RATE` APM trace sample rate (`0` to `1`, default `0`)
  - `SENTRY_PROFILES_SAMPLE_RATE` profile sample rate (`0` to `1`, default `0`)
  - `UPTIME_HEARTBEAT_URL` optional heartbeat URL (pinged on start, interval, and shutdown)
  - `UPTIME_HEARTBEAT_INTERVAL_MS` heartbeat cadence in milliseconds (default: `60000`)
  - `DB_PATH` to override database location (use `:memory:` for ephemeral runtime/tests)
  - `DB_CLIENT` database client (`sqlite` default, or `postgres`)
  - `ALLOW_SQLITE_IN_PRODUCTION=true` explicit override to allow SQLite when `NODE_ENV=production`
  - `DATABASE_URL` PostgreSQL connection URL when `DB_CLIENT=postgres`
  - `PG_POOL_MAX`, `PG_IDLE_TIMEOUT_MS`, `PG_CONNECTION_TIMEOUT_MS` for PostgreSQL pool tuning
  - `HTTPS_ENFORCE_IN_PRODUCTION=true` to require HTTPS when running in production
  - `HTTPS_ENFORCEMENT_MODE` HTTPS behavior when request is not secure (`reject` or `redirect`, default `reject`)
  - `HTTPS_TRUST_FORWARDED_PROTO=true` to honor reverse-proxy `X-Forwarded-Proto` / `Forwarded` headers
  - `HTTPS_REDIRECT_STATUS_CODE` redirect code for `redirect` mode (`301`, `302`, `307`, `308`; default `308`)
  - `DB_BACKUP_ENABLED=true` to enable automated SQLite backups
  - `DB_BACKUP_DIR` to override backup destination (default: `data/backups`)
  - `DB_BACKUP_INTERVAL_MS` to set backup cadence in milliseconds (default: `21600000` / 6 hours)
  - `DB_BACKUP_RETENTION_COUNT` to keep only the newest N backup files (default: `14`)
  - `JOB_QUEUE_ENABLED=true` to use Redis/BullMQ for distributed scheduled jobs
  - `JOB_QUEUE_REDIS_URL` Redis connection URL for queue mode
  - `JOB_QUEUE_NAME`, `JOB_QUEUE_DLQ_NAME`, `JOB_QUEUE_CONCURRENCY`, `JOB_QUEUE_ATTEMPTS` for queue tuning
  - `JOB_QUEUE_DLQ_INSPECT_INTERVAL_MS` interval for dead-letter queue inspection/alerts (default: `60000`)
  - `JOB_QUEUE_DLQ_ALERT_THRESHOLD` minimum dead-letter count before warning logs (default: `1`)
  - `JOB_QUEUE_DLQ_RETRY_BATCH_SIZE` number of dead-letter jobs to auto-requeue per inspect cycle (default: `0` = disabled)
  - `PASSWORD_RESET_WEBHOOK_URL` to deliver reset tokens to your notification service
  - `PASSWORD_RESET_WEBHOOK_TIMEOUT_MS` to bound webhook delivery latency (default: `5000`)
  - `LOG_LEVEL_MODULES` per-module log level overrides, e.g. `auth=debug,queue=warn`
  - `LOG_HTTP_BODIES=true` to emit redacted request/response payload previews in structured request logs
  - `LOG_HTTP_PAYLOAD_MAX_BYTES` max serialized payload preview length (default: `2048`)
  - `OVERDUE_SYNC_INTERVAL_MS` to control background overdue status reconciliation interval in milliseconds (default: `60000`)
  - `MAINTENANCE_CLEANUP_INTERVAL_MS` background retention cleanup interval (default: `86400000`)
  - `ARCHIVE_CLOSED_LOANS_AFTER_YEARS` auto-archive threshold for closed loans (default: `3`)
  - `PURGE_SOFT_DELETED_CLIENTS_AFTER_DAYS` purge threshold for soft-deleted clients with no financial dependencies (default: `180`)
  - `HIERARCHY_CACHE_TTL_MS` to configure hierarchy service cache TTL in milliseconds (default: `30000`)
  - `ALLOW_CONSOLE_RESET_TOKENS=true` for non-production console fallback delivery
  - `REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL=true` to block loan approvals until client KYC is verified
  - `ALLOW_CONCURRENT_LOANS=true` to allow creating multiple concurrent active/restructured loans per client (default `false`)
  - `UPLOAD_STORAGE_DRIVER` (`local` or `s3`, default `local`)
  - `UPLOAD_LOCAL_DIR` local upload directory (default: `data/uploads`)
  - `UPLOAD_PUBLIC_BASE_PATH` local static base path (default: `/uploads`)
  - `UPLOAD_PUBLIC_BASE_URL` optional absolute base URL override for locally stored files
  - `UPLOAD_MAX_FILE_SIZE_MB` max multipart upload size per file (default: `10`)
  - `UPLOAD_S3_ENDPOINT`, `UPLOAD_S3_BUCKET`, `UPLOAD_S3_REGION`, `UPLOAD_S3_ACCESS_KEY_ID`, `UPLOAD_S3_SECRET_ACCESS_KEY` for S3-compatible storage mode
  - `UPLOAD_S3_FORCE_PATH_STYLE=true` to force path-style bucket addressing (recommended for many S3-compatible providers)
  - `UPLOAD_S3_PUBLIC_BASE_URL` optional absolute base URL override for S3 object URLs

3. Start server:

   ```bash
   npm start
   ```

  Environment variables are loaded automatically from `.env` via `dotenv`.

4. Open dashboard:

  ```
  http://localhost:3000
  ```

5. Health check:

   ```bash
   GET http://localhost:3000/health
   ```

  Detailed health:

  ```bash
  GET http://localhost:3000/health/details
  ```

  Prometheus scrape endpoint:

  ```bash
  GET http://localhost:3000/metrics
  ```

  Readiness probe:

  ```bash
  GET http://localhost:3000/ready
  GET http://localhost:3000/api/ready
  ```

## API Versioning

- Existing routes continue to work under `/api/*`.
- Versioned aliases are supported via `/api/v1/*` (rewritten to the same handlers).
- Use `/api/v1/*` for mobile/client integrations to reduce future breaking-change risk.

The database is created automatically at `data/microfinance.db` on first run.

## Run tests

```bash
npm test
```

Run financial precision regressions only:

```bash
npm run test:precision
```

## Migrations (Prisma)

```bash
npm run migrate
```

Create/apply a new development migration:

```bash
npm run migrate:dev -- --name <migration_name>
```

Reset local database (destructive):

```bash
npm run migrate:reset
```

SQLite -> PostgreSQL data migration:

```bash
npm run migrate:postgres
```

Notes:
- The target PostgreSQL schema must already exist before running `migrate:postgres`.
- The migration script copies table data in batches and aligns serial sequences after import.

Prisma client generation:

```bash
npm run prisma:generate
```

Prisma schema deployment:

  ```bash
  npm run prisma:migrate
  ```

## Run with Docker

Set `JWT_SECRET` in your shell or `.env` before starting containers.

1. Build and start API + Redis:

   ```bash
   docker compose up --build
   ```

2. API will be available at:

   ```
   http://localhost:3000
   ```

3. Stop services:

   ```bash
   docker compose down
   ```

Constraint note:
- Prisma model DSL does not natively express SQLite `CHECK` constraints and some partial/expression indexes.
- Critical guards are enforced in SQL migration files under `prisma/migrations/*/migration.sql`.

### Referential action policy (Prisma relations)

The Prisma schema now declares explicit `onDelete` actions so relation behavior is deterministic:

- Financial parent records (`loans`, `repayments`, `approval_requests`) use `onDelete: Restrict` for critical required links.
- Optional historical/actor links use `onDelete: SetNull` (for example `created_by_user_id`, `approved_by_user_id`, `branch_id` where nullable).
- Pure link-table rows use `onDelete: Cascade` (for example `area_manager_branch_assignments`, `loan_guarantors`, `loan_collaterals`).

Safe rollout steps:

1. Backup database (`npm run backup:db` or your regular backup process).
2. Generate migration SQL and review carefully:

  ```bash
  npm run migrate:dev -- --name relation_ondelete_policies
  ```

3. Apply in non-production and run integration tests.
4. Deploy migration to production using your normal `prisma migrate deploy` path.

## Lint & format

```bash
npm run lint
npm run format
```

Key integration suites:
- `tests/auth-security.test.js`
- `tests/loan-workflows.test.js`
- `tests/collection-workflows.test.js`
- `tests/hierarchy-management.test.js`
- `tests/financial-precision-regression.test.js`

## Type check (incremental TS migration)

```bash
npm run typecheck
```

Strict pilot (higher-signal checks on a curated subset):

```bash
npm run typecheck:strict
```

Current scope is intentionally narrow for safe rollout: `src/utils/http.js`, `src/utils/helpers.js`, `src/utils/sqlBuilder.js`, `src/routes/systemRoutes.js`, `src/routes/authRoutes.js`, `src/routes/clientRoutes.js`, `src/routes/collectionRoutes.js`, `src/routes/branchRoutes.js`, `src/routes/userRoutes.js`, `src/routes/loanRoutes.js`, `src/routes/reportRoutes.js`, `src/middleware/auth.js`, `src/middleware/requestContext.js`, `src/middleware/errorHandler.js`, `src/config/roles.js`, `src/config/security.js`, `src/services/logger.js`, `src/services/metricsService.js`, `src/services/reportCacheService.js`, `src/services/hierarchyService.js`, `src/services/hierarchyEventService.js`, and `src/db.js` (plus `src/types/*`), using `@ts-check` with `noEmit`.

## Default admin login

> **Security warning (first boot):** when the `users` table is empty, the server seeds a default admin account (`admin@afriserve.local` / `Admin@123`). Change this password immediately after startup and before exposing the system on any shared or public network.

- Email: `admin@afriserve.local`
- Password: `Admin@123`

## API Endpoints

All `/api/*` routes require `Authorization: Bearer <token>`, except public auth endpoints (`/api/auth/login`, `/api/auth/refresh`, `/api/auth/reset-password/request`, `/api/auth/reset-password/confirm`).

### Auth & Users

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`
- `POST /api/auth/logout` (authenticated)
- `POST /api/auth/change-password` (authenticated)
- `POST /api/auth/reset-password/request` (public)
- `POST /api/auth/reset-password/confirm` (public)
- `GET /api/openapi.json` (public OpenAPI spec)
- `GET /api/docs` (public Swagger UI)
- `GET /api/users` (admin only)
- `GET /api/users?role=loan_officer&isActive=true&branchId=12&regionId=3&search=john&limit=20&offset=0&sortBy=createdAt&sortOrder=desc` (admin only)
- `POST /api/users` (admin, it)
- `GET /api/users/summary` (admin only)
- `GET /api/users/roles` (admin only)
- `GET /api/users/:id` (admin only)
- `PATCH /api/users/:id/profile` (admin only)
- `PATCH /api/users/:id/role` (admin only)
- `POST /api/users/:id/revoke-sessions` (admin only)
- `POST /api/users/:id/unlock` (admin only)
- `POST /api/users/:id/reset-token` (admin only)
- `POST /api/users/:id/deactivate` (admin only)
- `POST /api/users/:id/activate` (admin only)
- `DELETE /api/users/:id` (admin only, soft-delete/deactivate)

Role input note:
- User role values are normalized on write (case-insensitive; spaces/hyphens become underscores). Examples: `CEO` -> `ceo`, `IT` -> `it`, `operations manager` -> `operations_manager`, `branch manager` -> `operations_manager`.

`GET /api/users` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Allowed filters: `role`, `isActive`, `branchId`, `regionId`, `search`, `limit`, `offset`, `sortBy`, `sortOrder`.
Allowed `sortBy`: `id`, `fullName`, `email`, `role`, `isActive`, `createdAt`.

Hierarchy assignment fields on user create/update:
- `branchId` for branch-scoped roles (`operations_manager`, `loan_officer`)
- `branchIds` (array) for multi-branch roles:
  - `area_manager` (single region enforced)
  - `investor` and `partner` (one or more active branches, can span regions)
- `branchCount` (number) for `area_manager` auto-assignment when selecting N branches in one region
- `primaryRegionId` optional region anchor for hierarchy visibility
- When `branchId` is omitted for branch-scoped roles, the system auto-assigns the first active branch

`GET /api/users/summary` response shape:

```json
{
  "totals": {
    "totalUsers": 0,
    "activeUsers": 0,
    "inactiveUsers": 0,
    "lockedUsers": 0
  },
  "byRole": [
    {
      "role": "admin",
      "totalUsers": 0,
      "activeUsers": 0
    }
  ]
}
```

`GET /api/users/roles` response shape:

```json
{
  "roles": [
    {
      "key": "admin",
      "label": "Administrator",
      "description": "Full system access including security and user administration.",
      "capabilities": ["users:create"],
      "assignedUsers": 0,
      "activeUsers": 0
    }
  ]
}
```

### Hierarchy & Branches

- `GET /api/regions` (authenticated, scoped)
- `GET /api/branches` (authenticated, scoped)
- `GET /api/branches?search=nairobi&regionId=2&isActive=true&limit=50&offset=0&sortBy=name&sortOrder=asc`
- `GET /api/branches/:id` (authenticated, scoped; includes branch portfolio stats)
- `POST /api/branches` (admin only)
- `PATCH /api/branches/:id` (admin only)
- `DELETE /api/branches/:id` (admin only, soft-deactivate)
- `DELETE /api/branches/:id/permanent` (admin only, permanent delete when no linked records exist)
- `GET /api/hierarchy/tree` (admin only)
- `GET /api/hierarchy/events?sinceId=0&limit=100` (authenticated, scoped)
- `GET /api/hierarchy-events?eventType=hierarchy.branch.created&scopeLevel=branch&branchId=12&actorUserId=1&dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-01-31T23:59:59.999Z&limit=50&offset=0` (admin only)

`GET /api/branches/:id` includes `stats` with `total_clients`, `active_clients`, `total_loans`, `active_loans`, `restructured_loans`, `written_off_loans`, `principal_disbursed`, `expected_total`, `repaid_total`, `outstanding_balance`, `written_off_balance`, `overdue_installments`, and `overdue_loans`.

### Clients

- `POST /api/clients` (admin, loan_officer, operations_manager)
- `PATCH /api/clients/:id` (admin, loan_officer, operations_manager)
- `PATCH /api/clients/:id/kyc` (admin, operations_manager)
- `GET /api/clients` (admin, ceo, operations_manager, it, area_manager, loan_officer)
- `GET /api/clients?search=jane&minLoans=1&limit=20&offset=0&sortBy=fullName&sortOrder=asc`
- `GET /api/clients/:id` (admin, ceo, operations_manager, it, area_manager, loan_officer)

`PATCH /api/clients/:id` supports: `fullName`, `phone`, `nationalId`, `isActive`, `kraPin`, `photoUrl`, `idDocumentUrl`, `nextOfKinName`, `nextOfKinPhone`, `nextOfKinRelation`, `businessType`, `businessYears`, `businessLocation`, `residentialAddress`, `officerId`.

`PATCH /api/clients/:id/kyc` body:

```json
{
  "status": "verified",
  "note": "All KYC documents validated"
}
```

If `REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL=true`, loan approvals are blocked unless `client.kyc_status = 'verified'`.
`nationalId` is enforced as unique (case-insensitive, non-empty values), and inactive clients cannot receive new loans.
By default, clients can have only one active/restructured loan at a time; set `ALLOW_CONCURRENT_LOANS=true` to allow concurrent active loans.

`GET /api/clients` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Allowed filters: `search`, `minLoans`, `limit`, `offset`, `sortBy`, `sortOrder`.
Allowed `sortBy`: `id`, `fullName`, `createdAt`, `loanCount`.

### Loans

- `POST /api/loans` (admin, loan_officer, operations_manager)
- `GET /api/loans`
- `GET /api/loans?includeBreakdown=true`
- `GET /api/loans?status=active&clientId=4&limit=20&offset=0`
- `GET /api/loans?sortBy=balance&sortOrder=asc`
- `GET /api/loans/:id`
- `GET /api/loans/:id/breakdown`
- `GET /api/loans/:id/schedule`
- `POST /api/loans/:id/approve` (admin, operations_manager)
- `POST /api/loans/:id/disburse` (admin, operations_manager, cashier, finance)
- `POST /api/loans/:id/restructure` (admin, finance, operations_manager)
- `POST /api/loans/:id/write-off` (admin, finance)
- `POST /api/loans/:id/archive` (admin, finance, operations_manager)

`GET /api/loans` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Allowed `sortBy` values: `id`, `disbursedAt`, `principal`, `expectedTotal`, `balance`, `repaidTotal`, `status`.
Allowed `status` filter values: `pending_approval`, `approved`, `active`, `closed`, `restructured`, `written_off`, `rejected`.

### Repayments

- `POST /api/loans/:id/repayments` (admin, cashier, finance)
- `GET /api/loans/:id/repayments`

### Uploads

- `POST /api/uploads/client-document` (admin, operations_manager; multipart/form-data)

Multipart fields:
- `clientId` (number)
- `documentType` (`photo` or `id_document`)
- `file` (binary file part)

### Transactions

- `GET /api/transactions` (admin, ceo, finance, operations_manager, area_manager, loan_officer, cashier)
- `GET /api/transactions?txType=repayment&loanId=4&limit=20&offset=0&sortBy=occurredAt&sortOrder=desc` (admin, ceo, finance, operations_manager, area_manager, loan_officer, cashier)

`GET /api/transactions` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 20,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Allowed filters: `txType`, `clientId`, `loanId`, `limit`, `offset`, `sortBy`, `sortOrder`.
Allowed `txType`: `disbursement`, `repayment`, `registration_fee`, `processing_fee`.
Allowed `sortBy`: `id`, `occurredAt`, `amount`, `txType`.

### Audit Logs

- `GET /api/audit-logs?action=client.created&userId=1&targetType=client&targetId=4&dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-01-31T23:59:59.999Z&limit=50&offset=0` (admin only)

`GET /api/audit-logs` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Supported filters: `action`, `userId`, `targetType`, `targetId`, `dateFrom`, `dateTo`, `limit`, `offset`.

### Hierarchy Events Journal

- `GET /api/hierarchy-events?eventType=hierarchy.branch.created&scopeLevel=branch&regionId=1&branchId=12&actorUserId=1&dateFrom=2026-01-01T00:00:00.000Z&dateTo=2026-01-31T23:59:59.999Z&limit=50&offset=0` (admin only)

`GET /api/hierarchy-events` returns a paged envelope:

```json
{
  "data": [],
  "paging": {
    "total": 0,
    "limit": 50,
    "offset": 0
  },
  "sort": {
    "sortBy": "id",
    "sortOrder": "desc"
  }
}
```

Supported filters: `eventType`, `scopeLevel`, `regionId`, `branchId`, `actorUserId`, `dateFrom`, `dateTo`, `limit`, `offset`.

### Collections

- `GET /api/collections/overdue?minDaysOverdue=7&limit=20&offset=0&sortBy=daysOverdue&sortOrder=desc` (admin, loan_officer, cashier, ceo, finance, operations_manager, it, area_manager)
- `POST /api/collections/actions` (admin, loan_officer, cashier, operations_manager, area_manager)
- `PATCH /api/collections/actions/:id` (admin, loan_officer, cashier, operations_manager, area_manager)
- `GET /api/collections/actions?loanId=4&status=open&limit=20&offset=0` (admin, loan_officer, cashier, ceo, finance, operations_manager, it, area_manager)

### System

- `GET /api/system/config-status` (admin only)
- `GET /api/system/metrics` (admin only)
- `POST /api/system/backup` (admin only, triggers an immediate backup when enabled)
- `GET /health/details` (public operational health)
- `GET /metrics` (public Prometheus-compatible metrics output)

### Reports

- `GET /api/reports/portfolio`
- `GET /api/reports/portfolio?format=csv`
- `GET /api/reports/portfolio?format=pdf`
- `GET /api/reports/portfolio?format=xlsx`
- `GET /api/reports/portfolio?includeBreakdown=true`
- `GET /api/reports/board-summary`
- `GET /api/reports/board-summary?periodDays=30&branchLimit=6`
- `GET /api/reports/board-summary?format=csv`
- `GET /api/reports/hierarchy/performance` (admin, operations_manager, area_manager)
- `GET /api/reports/hierarchy/performance?format=csv` (admin, operations_manager, area_manager)
- `GET /api/reports/collections-summary` (admin, loan_officer, cashier, ceo, finance, operations_manager, it, area_manager)

`GET /api/reports/portfolio` includes lifecycle metrics for restructured and written-off loans (`restructured_loans`, `written_off_loans`, `written_off_balance`).
`GET /api/reports/portfolio?includeBreakdown=true` additionally returns `branchBreakdown` and `regionBreakdown` arrays in the same response, scoped to the caller's hierarchy access.
`GET /api/reports/board-summary` returns executive KPIs for sustainability and risk governance (collection coverage, PAR30/PAR90, top at-risk branches, and rolling collections trend).
All dedicated `/api/reports/*` endpoints support `format=json|csv|pdf|xlsx`.

## Example payloads

Create client:

```json
{
  "fullName": "Jane Doe",
  "phone": "+254700000001",
  "nationalId": "12345678",
  "branchId": 7
}
```

Create loan:

```json
{
  "clientId": 1,
  "principal": 1000,
  "termWeeks": 12,
  "branchId": 7
}
```

Repayment:

```json
{
  "amount": 150,
  "note": "Weekly collection"
}
```

Login:

```json
{
  "email": "admin@afriserve.local",
  "password": "Admin@123"
}
```

Change password:

```json
{
  "currentPassword": "Admin@123",
  "newPassword": "Admin@456"
}
```

Reset request:

```json
{
  "email": "admin@afriserve.local"
}
```

Response note: reset request endpoints do not return token values.
Delivery note:
- If `PASSWORD_RESET_WEBHOOK_URL` is set, tokens are sent to that webhook.
- Otherwise, in non-production (or when `ALLOW_CONSOLE_RESET_TOKENS=true`) tokens are logged to server console.

Reset confirm:

```json
{
  "token": "<token-from-request>",
  "newPassword": "Admin@123"
}
```

Admin profile update:

```json
{
  "fullName": "Jane Ops",
  "email": "jane.ops@afriserve.local",
  "isActive": true
}
```

Admin role allocation:

```json
{
  "role": "loan_officer"
}
```

Admin role allocation (area manager scope):

```json
{
  "role": "area_manager",
  "primaryRegionId": 3,
  "branchIds": [17, 19, 24],
  "branchCount": 3
}
```

Create branch:

```json
{
  "name": "Kisumu Central",
  "branchCode": "KSM-CENTRAL",
  "county": "Kisumu",
  "town": "Kisumu",
  "locationAddress": "Oginga Odinga St, Kisumu",
  "regionId": 6,
  "contactPhone": "+254700000222",
  "contactEmail": "kisumu.central@afriserve.local"
}
```

## Audit coverage

The system logs key events to `audit_logs`, including login success, user creation, client creation, loan creation, repayment posting, password change/reset events, and hierarchy updates (branch create/update/deactivate, user scope changes).

## Brute-force protection

- Authentication endpoints are rate-limited (15-minute window).
- All `/api/*` routes are additionally rate-limited to 200 requests/minute per IP.
- User accounts are temporarily locked for 15 minutes after 5 consecutive failed login attempts.
- Successful login, password change, or password reset clears lockout counters.

## Security defaults

- `JWT_SECRET` must be provided at startup.
- `JWT_SECRETS` supports phased JWT secret rotation (new tokens use first secret, previous secrets remain verifiable).
- `DB_CLIENT=sqlite` is blocked in production unless `ALLOW_SQLITE_IN_PRODUCTION=true` is explicitly set.
- CORS is restricted to configured origins.
- Security headers are enabled via `helmet` with CSP.
- `trust proxy` is enabled in production (or when `TRUST_PROXY=true`) so `req.ip` reflects real client IPs behind reverse proxies.
- JWTs are checked against current user status (`is_active`) and token version on each request.
- Reset token values are never included in API responses.
- New and reset passwords require at least 8 characters with uppercase, lowercase, number, and special character.
- `audit_logs` is enforced as append-only at database level (update/delete blocked by triggers).

## Operational readiness

- Every request receives an `X-Request-Id` header for traceability.
- Error responses include `requestId` for support correlation.
- Startup includes environment validation for security and scheduler-related variables.
- Structured JSON logs are emitted with request and runtime events.
- Optional log shipping is supported via `LOG_SHIPPER_*` settings.
- `/health/details` includes database connectivity status and background task state.
- `/metrics` exposes Prometheus-compatible metrics for scraping.
- Schema migrations are tracked in `schema_migrations` and can be run via `npm run migrate`.
- `/api/system/metrics` exposes in-process request/error/background task counters (admin-only).
- Optional Sentry error capture is available via `SENTRY_*` settings.
- Optional uptime heartbeat pings are available via `UPTIME_HEARTBEAT_*` settings.
- `/api/openapi.json` and `/api/docs` expose live API contracts for frontend/mobile integration.
- Automated database backups are available via `DB_BACKUP_*` settings and manual trigger endpoint.
- Optional report-response caching is available via `REPORT_CACHE_*` settings (`memory` by default, `redis` when configured).
- Scheduled daily portfolio digest delivery is configurable via `REPORT_DELIVERY_*` settings (recipient + optional webhook transport).
- Overdue sync, backup, and scheduled report-delivery jobs use retry with backoff to degrade gracefully during transient failures.
- Graceful shutdown is enabled for `SIGINT` and `SIGTERM`.

## Current data-layer limitations

- SQLite access uses `better-sqlite3` (synchronous driver). The exported `run/get/all` APIs return Promises for interface consistency, but database work still runs on the Node.js event loop thread.
- PostgreSQL support includes pooled `run/get/all` operations; remaining transaction-heavy flows still require deeper async query compatibility validation before full multi-writer cutover.
- Queue mode (`JOB_QUEUE_ENABLED=true`) uses BullMQ + Redis for retry/backoff, dead-letter queue handoff, and distributed workers, replacing in-process timers.

## Production roadmap

- TypeScript migration: introduce `checkJs` and incremental module conversion (`utils` -> `services` -> `routes`) with shared DTO types.
- SQL injection hardening: initial SQL condition builder now backs report-route filter composition; continue migrating remaining complex SQL to a full query-builder pattern.
- Caching strategy: optional report cache service is available (memory mode by default, Redis strategy when configured); next step is broader endpoint coverage and deployment hardening.
- Database scaling: define PostgreSQL migration path (schema parity, data migration, cutover, rollback) for multi-writer production load.
- Connection pooling: use PostgreSQL pool configuration (`max`, `idleTimeoutMillis`, `connectionTimeoutMillis`) once migrated off SQLite.
- Report performance: move heavy recurring report queries to materialized views with scheduled refresh in PostgreSQL.

