import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { ZodError } from "zod";
import packageJson from "../../package.json" with { type: "json" };
import { run,
  get,
  all,
  readGet,
  readAll,
  executeTransaction,
  prisma,
  initSchema,
  runMigrations,
  closeDb,
  getDatabaseInfo,
  backupDatabase, } from "../db.js";
import { createClientSchema,
  updateClientSchema,
  updateClientKycSchema,
  createClientProfileRefreshSchema,
  updateClientProfileRefreshDraftSchema,
  listClientProfileRefreshesQuerySchema,
  reviewClientProfileRefreshSchema,
  createClientGuarantorSchema,
  updateClientGuarantorSchema,
  createClientCollateralSchema,
  updateClientCollateralSchema,
  recordClientFeePaymentSchema,
  potentialClientDuplicateQuerySchema,
  portfolioReallocationSchema,
  createLoanSchema,
  updateLoanDetailsSchema,
  createRepaymentSchema,
  createGuarantorSchema,
  createCollateralAssetSchema,
  updateCollateralAssetSchema,
  linkLoanGuarantorSchema,
  linkLoanCollateralSchema,
  loanLifecycleActionSchema,
  restructureLoanSchema,
  topUpLoanSchema,
  refinanceLoanSchema,
  extendLoanTermSchema,
  assignLoanOfficerSchema,
  createLoanProductSchema,
  updateLoanProductSchema,
  approveLoanSchema,
  disburseLoanSchema,
  rejectLoanSchema,
  loginSchema,
  refreshTokenSchema,
  createUserSchema,
  updateUserProfileSchema,
  allocateUserRoleSchema,
  changePasswordSchema,
  resetPasswordRequestSchema,
  resetPasswordConfirmSchema,
  adminResetPasswordSchema,
  createCollectionActionSchema,
  updateCollectionActionSchema,
  createBranchSchema,
  updateBranchSchema, } from "../validators.js";
import { createAuthLimiter, createGeneralApiLimiter } from "./security.js";
import { createAuthMiddleware } from "../middleware/auth.js";
import { createErrorHandler } from "../middleware/errorHandler.js";
import { createAuditService } from "../services/auditService.js";
import { createPasswordResetService } from "../services/passwordResetService.js";
import { createHierarchyService } from "../services/hierarchyService.js";
import { createHierarchyEventService } from "../services/hierarchyEventService.js";
import { createLogger } from "../services/logger.js";
import { createErrorTracker } from "../services/errorTracker.js";
import { createMetricsService } from "../services/metricsService.js";
import { setDbQueryObserver } from "../observability/metricsRegistry.js";
import { createReportCacheService } from "../services/reportCacheService.js";
import { createScheduledReportService } from "../services/scheduledReportService.js";
import { createDocumentStorageService } from "../services/documentStorageService.js";
import { createMobileMoneyProvider } from "../services/mobileMoneyProvider.js";
import { createTokenBlacklistService } from "../services/tokenBlacklist.js";
import { createTokenRotationService } from "../services/tokenRotationService.js";
import { createDomainEventService } from "../services/domainEventService.js";
import { createLoanProductCatalogService } from "../services/loanProductCatalogService.js";
import { createAppServiceRegistry } from "../services/serviceRegistry.js";
import { readFeatureFlags } from "./featureFlags.js";
import { createAfricasTalkingSmsService } from "../infrastructure/notifications/AfricasTalkingSmsService.js";
import { LoanNotificationSubscriber } from "../infrastructure/notifications/LoanNotificationSubscriber.js";
import { createRabbitMqConsumer } from "../infrastructure/events/RabbitMqConsumer.js";
import { AccountingGlSubscriber } from "../infrastructure/accounting/AccountingGlSubscriber.js";
import { getAuthSessionCacheStatus } from "../services/authSessionCache.js";
import { getRateLimitBackendStatus } from "../services/rateLimitRedis.js";
import { getAllowedRoles, getRoleCatalog, normalizeRoleInput } from "./roles.js";
import { calculateExpectedTotal,
  normalizeEmail,
  parseId,
  addWeeksIso,
  createHttpError, } from "../utils/helpers.js";
import { parseBooleanEnv } from "../utils/env.js";
import { redactDatabasePathForStatus } from "../utils/redaction.js";
import { resolveDefaultBackupDir } from "../utils/projectPaths.js";
import type { AuthUserRow, CreateAuthMiddlewareOptions } from "../types/auth.js";

const appVersion = packageJson.version;
type BootstrapContextOptions = {
  env?: NodeJS.ProcessEnv;
};

async function createBootstrapContext(options: BootstrapContextOptions = {}) {
  const env = options.env || process.env;

  const logger = createLogger();
  const errorTracker = await createErrorTracker({ env, logger });
  const metrics = createMetricsService();
  setDbQueryObserver(metrics.observeDbQuery);
  const port = Number(env.PORT || 3000);
  const jwtSecret = env.JWT_SECRET;
  const configuredJwtSecrets = String(env.JWT_SECRETS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const jwtSecrets = [...new Set([String(jwtSecret || "").trim(), ...configuredJwtSecrets].filter(Boolean))];
  // Token expiry — configurable for different deployment requirements
  // Default: 12h for balance of security and UX
  const rawTokenExpiry = String(process.env.JWT_TOKEN_EXPIRY || "").trim();
  const tokenExpiry = rawTokenExpiry && /^\d+[smhd]$/.test(rawTokenExpiry) ? rawTokenExpiry : "12h";
  const loginMaxFailedAttempts = 5;
  const loginLockMinutes = 15;

  const configuredOverdueSyncIntervalMs = Number(env.OVERDUE_SYNC_INTERVAL_MS);
  const overdueSyncIntervalMs = Number.isFinite(configuredOverdueSyncIntervalMs) && configuredOverdueSyncIntervalMs >= 100
    ? Math.floor(configuredOverdueSyncIntervalMs)
    : 60000;

  const { client: databaseClient, path: databasePath, isInMemory: isInMemoryDb } = getDatabaseInfo();
  const configuredBackupDir = String(env.DB_BACKUP_DIR || "").trim();
  const backupDirectory = configuredBackupDir || resolveDefaultBackupDir(process.cwd());
  const configuredBackupIntervalMs = Number(env.DB_BACKUP_INTERVAL_MS);
  const backupIntervalMs = Number.isFinite(configuredBackupIntervalMs) && configuredBackupIntervalMs >= 60000
    ? Math.floor(configuredBackupIntervalMs)
    : 6 * 60 * 60 * 1000;
  const configuredBackupRetentionCount = Number(env.DB_BACKUP_RETENTION_COUNT);
  const backupRetentionCount = Number.isFinite(configuredBackupRetentionCount) && configuredBackupRetentionCount >= 1
    ? Math.floor(configuredBackupRetentionCount)
    : 14;

  const trustProxyRequested = parseBooleanEnv(env.TRUST_PROXY, false);
  // Mirror the fix in security.ts: never auto-enable trust proxy based on
  // NODE_ENV alone.  Requires explicit TRUST_PROXY=true in all environments.
  const trustProxyEnabled = trustProxyRequested;

  const reportCacheEnabled = parseBooleanEnv(env.REPORT_CACHE_ENABLED, false);
  const configuredReportCacheTtlMs = Number(env.REPORT_CACHE_TTL_MS);
  const reportCacheTtlMs = Number.isFinite(configuredReportCacheTtlMs) && configuredReportCacheTtlMs >= 100
    ? Math.floor(configuredReportCacheTtlMs)
    : 15000;
  const reportCacheStrategy = String(env.REPORT_CACHE_STRATEGY || "memory").trim().toLowerCase() === "redis"
    ? "redis"
    : "memory";
  const reportCacheRedisUrl = String(env.REPORT_CACHE_REDIS_URL || "").trim();

  const backupsRequested = parseBooleanEnv(env.DB_BACKUP_ENABLED, false);
  const backupsEnabled = backupsRequested && !isInMemoryDb && databaseClient === "sqlite";

  const jobQueueEnabled = parseBooleanEnv(env.JOB_QUEUE_ENABLED, false);
  const jobQueueRedisUrl = String(env.JOB_QUEUE_REDIS_URL || "").trim();
  const rawJobQueueRole = String(env.JOB_QUEUE_ROLE || "all").trim().toLowerCase();
  const jobQueueRole = ["scheduler", "worker"].includes(rawJobQueueRole) ? rawJobQueueRole : "all";
  const jobQueueSchedulerEnabled = jobQueueEnabled && jobQueueRole !== "worker";
  const jobQueueWorkerEnabled = jobQueueEnabled && jobQueueRole !== "scheduler";
  const jobQueueName = String(env.JOB_QUEUE_NAME || "afriserve-system-jobs").trim() || "afriserve-system-jobs";
  const defaultJobQueueDeadLetterQueueName = `${jobQueueName}-dead-letter`;
  const jobQueueDeadLetterQueueName = String(
    env.JOB_QUEUE_DLQ_NAME || defaultJobQueueDeadLetterQueueName,
  ).trim() || defaultJobQueueDeadLetterQueueName;
  const configuredJobQueueConcurrency = Number(env.JOB_QUEUE_CONCURRENCY);
  const jobQueueConcurrency = Number.isFinite(configuredJobQueueConcurrency) && configuredJobQueueConcurrency >= 1
    ? Math.floor(configuredJobQueueConcurrency)
    : 4;
  const configuredJobQueueAttempts = Number(env.JOB_QUEUE_ATTEMPTS);
  const jobQueueAttempts = Number.isFinite(configuredJobQueueAttempts) && configuredJobQueueAttempts >= 1
    ? Math.floor(configuredJobQueueAttempts)
    : 5;
  const configuredDlqInspectIntervalMs = Number(env.JOB_QUEUE_DLQ_INSPECT_INTERVAL_MS);
  const jobQueueDlqInspectIntervalMs = Number.isFinite(configuredDlqInspectIntervalMs) && configuredDlqInspectIntervalMs >= 1000
    ? Math.floor(configuredDlqInspectIntervalMs)
    : 60000;
  const configuredDlqAlertThreshold = Number(env.JOB_QUEUE_DLQ_ALERT_THRESHOLD);
  const jobQueueDlqAlertThreshold = Number.isFinite(configuredDlqAlertThreshold) && configuredDlqAlertThreshold >= 0
    ? Math.floor(configuredDlqAlertThreshold)
    : 1;
  const configuredDlqRetryBatchSize = Number(env.JOB_QUEUE_DLQ_RETRY_BATCH_SIZE);
  const jobQueueDlqRetryBatchSize = Number.isFinite(configuredDlqRetryBatchSize) && configuredDlqRetryBatchSize >= 0
    ? Math.floor(configuredDlqRetryBatchSize)
    : 0;

  const configuredMaintenanceCleanupIntervalMs = Number(env.MAINTENANCE_CLEANUP_INTERVAL_MS);
  const maintenanceCleanupIntervalMs = Number.isFinite(configuredMaintenanceCleanupIntervalMs)
    && configuredMaintenanceCleanupIntervalMs >= 5 * 60 * 1000
    ? Math.floor(configuredMaintenanceCleanupIntervalMs)
    : 24 * 60 * 60 * 1000;
  const configuredArchiveClosedLoansYears = Number(env.ARCHIVE_CLOSED_LOANS_AFTER_YEARS);
  const archiveClosedLoansAfterYears = Number.isFinite(configuredArchiveClosedLoansYears) && configuredArchiveClosedLoansYears >= 1
    ? Math.floor(configuredArchiveClosedLoansYears)
    : 3;
  const configuredPurgeSoftDeletedClientsDays = Number(env.PURGE_SOFT_DELETED_CLIENTS_AFTER_DAYS);
  const purgeSoftDeletedClientsAfterDays = Number.isFinite(configuredPurgeSoftDeletedClientsDays)
    && configuredPurgeSoftDeletedClientsDays >= 1
    ? Math.floor(configuredPurgeSoftDeletedClientsDays)
    : 180;

  const accountingBatchEnabled = parseBooleanEnv(env.ACCOUNTING_BATCH_ENABLED, true);
  const configuredAccountingBatchIntervalMs = Number(env.ACCOUNTING_BATCH_INTERVAL_MS);
  const accountingBatchIntervalMs = Number.isFinite(configuredAccountingBatchIntervalMs)
    && configuredAccountingBatchIntervalMs >= 5 * 60 * 1000
    ? Math.floor(configuredAccountingBatchIntervalMs)
    : 6 * 60 * 60 * 1000;

  const reportDeliveryRequested = parseBooleanEnv(env.REPORT_DELIVERY_ENABLED, false);
  const configuredReportDeliveryIntervalMs = Number(env.REPORT_DELIVERY_INTERVAL_MS);
  const reportDeliveryIntervalMs = Number.isFinite(configuredReportDeliveryIntervalMs) && configuredReportDeliveryIntervalMs >= 100
    ? Math.floor(configuredReportDeliveryIntervalMs)
    : 24 * 60 * 60 * 1000;
  const reportDeliveryRecipientEmail = String(env.REPORT_DELIVERY_RECIPIENT_EMAIL || "").trim().toLowerCase();
  const reportDeliveryWebhookUrl = String(env.REPORT_DELIVERY_WEBHOOK_URL || "").trim();
  const configuredReportDeliveryWebhookTimeoutMs = Number(env.REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS);
  const reportDeliveryWebhookTimeoutMs = Number.isFinite(configuredReportDeliveryWebhookTimeoutMs)
    && configuredReportDeliveryWebhookTimeoutMs >= 500
    && configuredReportDeliveryWebhookTimeoutMs <= 60000
    ? Math.floor(configuredReportDeliveryWebhookTimeoutMs)
    : 5000;
  const reportDeliveryEnabled = reportDeliveryRequested && Boolean(reportDeliveryRecipientEmail);
  const uptimeHeartbeatUrl = String(env.UPTIME_HEARTBEAT_URL || "").trim();
  const otelExporterEndpoint = String(
    env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT || env.OTEL_EXPORTER_OTLP_ENDPOINT || "",
  ).trim();
  const configuredOtelTraceSampleRatio = Number(env.OTEL_TRACE_SAMPLE_RATIO);
  const otelTraceSampleRatio = Number.isFinite(configuredOtelTraceSampleRatio)
    ? Math.min(Math.max(configuredOtelTraceSampleRatio, 0), 1)
    : 1;
  const otelServiceName = String(env.OTEL_SERVICE_NAME || "").trim() || null;
  const otelTracingEnabled = Boolean(otelExporterEndpoint) && otelTraceSampleRatio > 0;
  const configuredUptimeHeartbeatIntervalMs = Number(env.UPTIME_HEARTBEAT_INTERVAL_MS);
  const uptimeHeartbeatIntervalMs = Number.isFinite(configuredUptimeHeartbeatIntervalMs)
    && configuredUptimeHeartbeatIntervalMs >= 10000
    ? Math.floor(configuredUptimeHeartbeatIntervalMs)
    : 60000;

  const requireVerifiedClientKycForLoanApproval = parseBooleanEnv(
    env.REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL,
    true,
  );
  const allowConcurrentLoans = parseBooleanEnv(env.ALLOW_CONCURRENT_LOANS, false);
  const mobileMoneyC2BEnabled = parseBooleanEnv(env.MOBILE_MONEY_C2B_ENABLED, false);
  const mobileMoneyB2CEnabled = parseBooleanEnv(env.MOBILE_MONEY_B2C_ENABLED, false);
  const mobileMoneyStkEnabled = parseBooleanEnv(env.MOBILE_MONEY_STK_ENABLED, false);
  const mobileMoneyWebhookToken = String(env.MOBILE_MONEY_WEBHOOK_TOKEN || "").trim();
  const mobileMoneyCallbackIpWhitelist = String(env.MOBILE_MONEY_CALLBACK_IP_WHITELIST || "").trim();
  const mobileMoneyDarajaBaseUrl = String(env.MOBILE_MONEY_DARAJA_BASE_URL || "").trim();
  const mobileMoneyDarajaConsumerKey = String(env.MOBILE_MONEY_DARAJA_CONSUMER_KEY || "").trim();
  const mobileMoneyDarajaConsumerSecret = String(env.MOBILE_MONEY_DARAJA_CONSUMER_SECRET || "").trim();
  const mobileMoneyDarajaB2CInitiatorName = String(env.MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME || "").trim();
  const mobileMoneyDarajaB2CSecurityCredential = String(env.MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL || "").trim();
  const mobileMoneyDarajaB2CShortCode = String(env.MOBILE_MONEY_DARAJA_B2C_SHORTCODE || "").trim();
  const mobileMoneyDarajaB2CResultUrl = String(env.MOBILE_MONEY_DARAJA_B2C_RESULT_URL || "").trim();
  const mobileMoneyDarajaB2CTimeoutUrl = String(env.MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL || "").trim();
  const mobileMoneyDarajaStkShortCode = String(env.MOBILE_MONEY_DARAJA_STK_SHORTCODE || "").trim();
  const mobileMoneyDarajaStkPasskey = String(env.MOBILE_MONEY_DARAJA_STK_PASSKEY || "").trim();
  const mobileMoneyDarajaStkCallbackUrl = String(env.MOBILE_MONEY_DARAJA_STK_CALLBACK_URL || "").trim();
  const configuredMobileMoneyProviderTimeoutMs = Number(env.MOBILE_MONEY_PROVIDER_TIMEOUT_MS);
  const mobileMoneyProviderTimeoutMs = Number.isFinite(configuredMobileMoneyProviderTimeoutMs)
    && configuredMobileMoneyProviderTimeoutMs >= 100
    ? Math.floor(configuredMobileMoneyProviderTimeoutMs)
    : 15000;
  const configuredMobileMoneyCircuitFailureThreshold = Number(env.MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD);
  const mobileMoneyCircuitFailureThreshold = Number.isFinite(configuredMobileMoneyCircuitFailureThreshold)
    && configuredMobileMoneyCircuitFailureThreshold >= 1
    ? Math.floor(configuredMobileMoneyCircuitFailureThreshold)
    : 3;
  const configuredMobileMoneyCircuitResetTimeoutMs = Number(env.MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS);
  const mobileMoneyCircuitResetTimeoutMs = Number.isFinite(configuredMobileMoneyCircuitResetTimeoutMs)
    && configuredMobileMoneyCircuitResetTimeoutMs >= 1000
    ? Math.floor(configuredMobileMoneyCircuitResetTimeoutMs)
    : 30000;
  const mobileMoneyB2CCoreRetryEnabled = parseBooleanEnv(env.MOBILE_MONEY_B2C_CORE_RETRY_ENABLED, true);
  const configuredMobileMoneyB2CCoreRetryIntervalMs = Number(env.MOBILE_MONEY_B2C_CORE_RETRY_INTERVAL_MS);
  const mobileMoneyB2CCoreRetryIntervalMs = Number.isFinite(configuredMobileMoneyB2CCoreRetryIntervalMs)
    && configuredMobileMoneyB2CCoreRetryIntervalMs >= 1000
    ? Math.floor(configuredMobileMoneyB2CCoreRetryIntervalMs)
    : 60000;
  const configuredMobileMoneyB2CCoreRetryMinAgeMs = Number(env.MOBILE_MONEY_B2C_CORE_RETRY_MIN_AGE_MS);
  const mobileMoneyB2CCoreRetryMinAgeMs = Number.isFinite(configuredMobileMoneyB2CCoreRetryMinAgeMs)
    && configuredMobileMoneyB2CCoreRetryMinAgeMs >= 0
    ? Math.floor(configuredMobileMoneyB2CCoreRetryMinAgeMs)
    : 30000;
  const configuredMobileMoneyB2CCoreRetryBatchSize = Number(env.MOBILE_MONEY_B2C_CORE_RETRY_BATCH_SIZE);
  const mobileMoneyB2CCoreRetryBatchSize = Number.isFinite(configuredMobileMoneyB2CCoreRetryBatchSize)
    && configuredMobileMoneyB2CCoreRetryBatchSize >= 1
    ? Math.floor(configuredMobileMoneyB2CCoreRetryBatchSize)
    : 25;

  const eventBrokerProviderRaw = String(env.EVENT_BROKER_PROVIDER || "none").trim().toLowerCase();
  const eventBrokerProvider = (["none", "rabbitmq", "kafka"].includes(eventBrokerProviderRaw)
    ? eventBrokerProviderRaw
    : "none") as "none" | "rabbitmq" | "kafka";
  const eventBrokerUrl = String(env.EVENT_BROKER_URL || "").trim();
  const eventTopicPrefix = String(env.EVENT_TOPIC_PREFIX || "afriserve").trim() || "afriserve";
  const eventDispatchInline = parseBooleanEnv(env.EVENT_DISPATCH_INLINE, true);
  const domainEventDispatchEnabled = parseBooleanEnv(env.DOMAIN_EVENT_DISPATCH_ENABLED, true);
  const configuredDomainEventDispatchIntervalMs = Number(env.DOMAIN_EVENT_DISPATCH_INTERVAL_MS);
  const domainEventDispatchIntervalMs = Number.isFinite(configuredDomainEventDispatchIntervalMs)
    && configuredDomainEventDispatchIntervalMs >= 1000
    ? Math.floor(configuredDomainEventDispatchIntervalMs)
    : 10000;
  const configuredDomainEventDispatchBatchSize = Number(env.DOMAIN_EVENT_DISPATCH_BATCH_SIZE);
  const domainEventDispatchBatchSize = Number.isFinite(configuredDomainEventDispatchBatchSize)
    && configuredDomainEventDispatchBatchSize >= 1
    ? Math.floor(configuredDomainEventDispatchBatchSize)
    : 100;
  const defaultTenantId = String(env.DEFAULT_TENANT_ID || "default").trim() || "default";

  // ── Accounting GL event consumer config ──────────────────────────────────
  // ACCOUNTING_GL_CONSUMER_ENABLED  subscribe to loan events at all (default true)
  // ACCOUNTING_GL_SHADOW_MODE       reconcile only, never write (default true; set false after parity verified)
  // RABBITMQ_ACCOUNTING_QUEUE       dedicated queue name for the GL consumer
  const accountingGlConsumerEnabled = parseBooleanEnv(env.ACCOUNTING_GL_CONSUMER_ENABLED, true);
  const accountingGlShadowMode      = parseBooleanEnv(env.ACCOUNTING_GL_SHADOW_MODE, true);
  const rabbitMqAccountingQueue     = String(
    env.RABBITMQ_ACCOUNTING_QUEUE || `${eventTopicPrefix}.accounting`,
  ).trim();

  // ── Shared services ───────────────────────────────────────────────────────
  const reportCache = createReportCacheService({
    enabled: reportCacheEnabled,
    defaultTtlMs: reportCacheTtlMs,
    strategy: reportCacheStrategy,
    redisUrl: reportCacheRedisUrl,
    logger,
    metrics,
  });
  const documentStorage = createDocumentStorageService({ logger });
  const scheduledReportService = createScheduledReportService();
  const mobileMoneyProvider = createMobileMoneyProvider({ env, logger });
  const domainEventService = createDomainEventService({
    run,
    all,
    logger,
    provider: eventBrokerProvider,
    brokerUrl: eventBrokerUrl,
    topicPrefix: eventTopicPrefix,
    dispatchInline: eventDispatchInline,
    defaultTenantId,
  });

  const tokenStoreRedisUrl = String(env.AUTH_TOKEN_STORE_REDIS_URL || env.REDIS_URL || "").trim();
  const authSessionCacheStatus = getAuthSessionCacheStatus();
  const rateLimitBackendStatus = getRateLimitBackendStatus();

  const authLimiter = createAuthLimiter();
  const generalApiLimiter = createGeneralApiLimiter();
  const { writeAuditLog } = createAuditService();
  const tokenBlacklist = await createTokenBlacklistService({
    redisUrl: tokenStoreRedisUrl,
    logger,
  });
  const tokenRotation = await createTokenRotationService({
    jwtSecret: jwtSecret ?? "",
    jwtSecrets,
    redisUrl: tokenStoreRedisUrl,
    logger,
  });

  const authMiddlewareGet: CreateAuthMiddlewareOptions["get"] = async (sql, params) => (
    await get(sql, params)
  ) as AuthUserRow | null | undefined;
  const authMiddlewareAll: NonNullable<CreateAuthMiddlewareOptions["all"]> = async (sql, params) => (
    await all(sql, params)
  ) as Array<Record<string, unknown>>;

  const { createToken, verifyToken, authenticate, authorize } = createAuthMiddleware({
    jwtSecret,
    jwtSecrets,
    tokenExpiry,
    get: authMiddlewareGet,
    all: authMiddlewareAll,
    isTokenBlacklisted: tokenBlacklist.isTokenBlacklisted,
  });
  const { issuePasswordResetToken } = createPasswordResetService({ writeAuditLog, logger });
  const hierarchyService = createHierarchyService({ get, all, executeTransaction });
  const hierarchyEventService = createHierarchyEventService();
  const errorHandler = createErrorHandler({
    ZodError,
    logger,
    metrics,
    errorTracker,
  });

  async function invalidateReportCaches() {
    if (!reportCache || !reportCache.enabled) return;
    try {
      await reportCache.invalidatePrefix("reports:");
    } catch (_error) {
      // best-effort
    }
  }

  const loanProductCatalogService = createLoanProductCatalogService({ get, createHttpError });

  const serviceRegistry = createAppServiceRegistry({
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
    mobileMoneyProvider,
    mobileMoneyC2BEnabled,
    mobileMoneyB2CEnabled,
    mobileMoneyStkEnabled,
    mobileMoneyWebhookToken,
    mobileMoneyProviderTimeoutMs,
    mobileMoneyCircuitFailureThreshold,
    mobileMoneyCircuitResetTimeoutMs,
    reportCache,
    logger,
    metrics,
    publishDomainEvent: domainEventService.publishDomainEvent,
    loanProductCatalogService,
    featureFlags: readFeatureFlags(),
  });

  // ── In-process subscribers ────────────────────────────────────────────────

  // 1. Borrower SMS notifications
  const notificationService = createAfricasTalkingSmsService(process.env);
  if (notificationService) {
    const notificationSubscriber = new LoanNotificationSubscriber(notificationService, get);
    notificationSubscriber.register(serviceRegistry.loan.eventBus);
  }

  // 2. Accounting GL subscriber
  //    Shadow mode (default): reconciles whether in-process GL already posted.
  //    Active mode: IS the GL posting path — set ACCOUNTING_GL_SHADOW_MODE=false
  //    after shadow parity is proven in staging.
  const glSubscriber = accountingGlConsumerEnabled
    ? new AccountingGlSubscriber({
        get,
        all,
        run,
        generalLedgerService: serviceRegistry.loan.generalLedgerService,
        shadowMode: accountingGlShadowMode,
        logger,
      })
    : null;

  if (glSubscriber) {
    glSubscriber.register(serviceRegistry.loan.eventBus);
    logger?.info?.("accounting.gl_subscriber.registered", {
      mode: accountingGlShadowMode ? "shadow" : "active",
      bus: "in-process",
    });
  }

  // ── RabbitMQ consumers ────────────────────────────────────────────────────
  const rabbitMqBrokerUrl = String(env.RABBITMQ_URL || env.EVENT_BROKER_URL || "").trim();

  // Queue 1: Notifications — processes loan events and sends borrower SMS
  const rabbitMqNotificationsConsumer = eventBrokerProvider === "rabbitmq"
    ? createRabbitMqConsumer({
        brokerUrl:   rabbitMqBrokerUrl,
        topicPrefix: eventTopicPrefix,
        queueName:   String(env.RABBITMQ_CONSUMER_QUEUE || `${eventTopicPrefix}.notifications`).trim(),
        maxRetries:  Number.isFinite(Number(env.RABBITMQ_CONSUMER_MAX_RETRIES))
                       ? Number(env.RABBITMQ_CONSUMER_MAX_RETRIES)
                       : 5,
        logger,
      })
    : null;

  if (rabbitMqNotificationsConsumer && notificationService) {
    const rmqNotificationSubscriber = new LoanNotificationSubscriber(notificationService, get);
    rmqNotificationSubscriber.register(rabbitMqNotificationsConsumer);
    rabbitMqNotificationsConsumer.start().catch((err: Error) => {
      logger?.warn?.("rabbitmq.notifications_consumer.start_failed", { error: err.message });
    });
    logger?.info?.("rabbitmq.notifications_consumer.started", {
      queue: `${eventTopicPrefix}.notifications`,
    });
  }

  // Queue 2: Accounting GL — dedicated queue, higher retry count, 7-day DLQ.
  //   Processes independently from notifications so a slow GL write doesn't
  //   block notification delivery and vice versa.
  const rabbitMqAccountingConsumer = eventBrokerProvider === "rabbitmq" && accountingGlConsumerEnabled
    ? createRabbitMqConsumer({
        brokerUrl:    rabbitMqBrokerUrl,
        topicPrefix:  eventTopicPrefix,
        queueName:    rabbitMqAccountingQueue,
        maxRetries:   Number.isFinite(Number(env.RABBITMQ_ACCOUNTING_MAX_RETRIES))
                        ? Number(env.RABBITMQ_ACCOUNTING_MAX_RETRIES)
                        : 10,
        messageTtlMs: 7 * 24 * 60 * 60 * 1000,   // 7-day DLQ retention for financial events
        logger,
      })
    : null;

  if (rabbitMqAccountingConsumer && glSubscriber) {
    glSubscriber.register(rabbitMqAccountingConsumer);
    rabbitMqAccountingConsumer.start().catch((err: Error) => {
      logger?.warn?.("rabbitmq.accounting_consumer.start_failed", { error: err.message });
    });
    logger?.info?.("rabbitmq.accounting_consumer.started", {
      queue:      rabbitMqAccountingQueue,
      shadowMode: accountingGlShadowMode,
    });
  }

  // ── Route dependencies ────────────────────────────────────────────────────
  const routeDepsBase: Record<string, unknown> = {
    run,
    get,
    all,
    reportGet: readGet,
    reportAll: readAll,
    executeTransaction,
    authenticate,
    authorize,
    createToken,
    verifyToken,
    issueRefreshToken: tokenRotation.issueRefreshToken,
    rotateRefreshToken: tokenRotation.rotateRefreshToken,
    revokeRefreshToken: tokenRotation.revokeRefreshToken,
    blacklistToken: tokenBlacklist.blacklistToken,
    authLimiter,
    writeAuditLog,
    issuePasswordResetToken,
    parseId,
    addWeeksIso,
    normalizeEmail,
    createHttpError,
    calculateExpectedTotal,
    createClientSchema,
    updateClientSchema,
    updateClientKycSchema,
    createClientProfileRefreshSchema,
    updateClientProfileRefreshDraftSchema,
    listClientProfileRefreshesQuerySchema,
    reviewClientProfileRefreshSchema,
    createClientGuarantorSchema,
    updateClientGuarantorSchema,
    createClientCollateralSchema,
    updateClientCollateralSchema,
    recordClientFeePaymentSchema,
    potentialClientDuplicateQuerySchema,
    portfolioReallocationSchema,
    createLoanSchema,
    updateLoanDetailsSchema,
    createRepaymentSchema,
    createGuarantorSchema,
    createCollateralAssetSchema,
    updateCollateralAssetSchema,
    linkLoanGuarantorSchema,
    linkLoanCollateralSchema,
    loanLifecycleActionSchema,
    restructureLoanSchema,
    topUpLoanSchema,
    refinanceLoanSchema,
    extendLoanTermSchema,
    assignLoanOfficerSchema,
    createLoanProductSchema,
    updateLoanProductSchema,
    approveLoanSchema,
    disburseLoanSchema,
    rejectLoanSchema,
    requireVerifiedClientKycForLoanApproval,
    allowConcurrentLoans,
    mobileMoneyProvider,
    mobileMoneyC2BEnabled,
    mobileMoneyB2CEnabled,
    mobileMoneyStkEnabled,
    mobileMoneyWebhookToken,
    loginSchema,
    refreshTokenSchema,
    createUserSchema,
    updateUserProfileSchema,
    allocateUserRoleSchema,
    changePasswordSchema,
    resetPasswordRequestSchema,
    resetPasswordConfirmSchema,
    adminResetPasswordSchema,
    createCollectionActionSchema,
    updateCollectionActionSchema,
    createBranchSchema,
    updateBranchSchema,
    getAllowedRoles,
    getRoleCatalog,
    normalizeRoleInput,
    hierarchyService,
    hierarchyEventService,
    bcrypt,
    crypto,
    loginMaxFailedAttempts,
    loginLockMinutes,
    logger,
    metrics,
    reportCache,
    documentStorage,
    serviceRegistry,
    publishDomainEvent: domainEventService.publishDomainEvent,
  };

  function buildConfigStatus(options: { envValidationWarnings?: number } = {}) {
    const envValidationWarnings = Number(options.envValidationWarnings || 0);
    const corsOrigins = (env.CORS_ORIGINS || "http://localhost:4000,http://127.0.0.1:4000")
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);
    const redactedDatabasePath = redactDatabasePathForStatus(databasePath, databaseClient);

    return {
      NODE_ENV: env.NODE_ENV || "development",
      PORT: port,
      LOG_LEVEL: logger.level,
      JWT_SECRET_SET: Boolean(env.JWT_SECRET),
      JWT_SECRETS_COUNT: jwtSecrets.length,
      JWT_ROTATION_ENABLED: jwtSecrets.length > 1,
      AUTH_TOKEN_STORE_REDIS_URL_SET: Boolean(tokenStoreRedisUrl),
      AUTH_TOKEN_BLACKLIST_STRATEGY: tokenBlacklist.strategy,
      AUTH_REFRESH_TOKEN_STRATEGY: tokenRotation.strategy,
      AUTH_SESSION_CACHE_STRATEGY: authSessionCacheStatus.strategy,
      AUTH_SESSION_CACHE_REDIS_URL_SET: authSessionCacheStatus.redisUrlConfigured,
      AUTH_SESSION_CACHE_TTL_SECONDS: authSessionCacheStatus.ttlSeconds,
      AUTH_SESSION_CACHE_REVALIDATE_AFTER_SECONDS: authSessionCacheStatus.revalidateAfterSeconds,
      RATE_LIMIT_STRATEGY: rateLimitBackendStatus.strategy,
      RATE_LIMIT_REDIS_URL_SET: rateLimitBackendStatus.redisUrlConfigured,
      DB_PATH: redactedDatabasePath,
      DB_CLIENT: databaseClient,
      DB_IS_IN_MEMORY: isInMemoryDb,
      OVERDUE_SYNC_INTERVAL_MS: overdueSyncIntervalMs,
      DB_BACKUP_REQUESTED: backupsRequested,
      DB_BACKUP_ENABLED: backupsEnabled,
      DB_BACKUP_DIRECTORY: backupDirectory,
      DB_BACKUP_INTERVAL_MS: backupIntervalMs,
      DB_BACKUP_RETENTION_COUNT: backupRetentionCount,
      JOB_QUEUE_ENABLED: jobQueueEnabled,
      JOB_QUEUE_ROLE: jobQueueRole,
      JOB_QUEUE_SCHEDULER_ENABLED: jobQueueSchedulerEnabled,
      JOB_QUEUE_WORKER_ENABLED: jobQueueWorkerEnabled,
      JOB_QUEUE_NAME: jobQueueName,
      JOB_QUEUE_DLQ_NAME: jobQueueDeadLetterQueueName,
      JOB_QUEUE_CONCURRENCY: jobQueueConcurrency,
      JOB_QUEUE_ATTEMPTS: jobQueueAttempts,
      JOB_QUEUE_DLQ_INSPECT_INTERVAL_MS: jobQueueDlqInspectIntervalMs,
      JOB_QUEUE_DLQ_ALERT_THRESHOLD: jobQueueDlqAlertThreshold,
      JOB_QUEUE_DLQ_RETRY_BATCH_SIZE: jobQueueDlqRetryBatchSize,
      JOB_QUEUE_REDIS_URL_SET: Boolean(jobQueueRedisUrl),
      MAINTENANCE_CLEANUP_INTERVAL_MS: maintenanceCleanupIntervalMs,
      ARCHIVE_CLOSED_LOANS_AFTER_YEARS: archiveClosedLoansAfterYears,
      PURGE_SOFT_DELETED_CLIENTS_AFTER_DAYS: purgeSoftDeletedClientsAfterDays,
      ACCOUNTING_BATCH_ENABLED: accountingBatchEnabled,
      ACCOUNTING_BATCH_INTERVAL_MS: accountingBatchIntervalMs,
      REPORT_DELIVERY_REQUESTED: reportDeliveryRequested,
      REPORT_DELIVERY_ENABLED: reportDeliveryEnabled,
      REPORT_DELIVERY_INTERVAL_MS: reportDeliveryIntervalMs,
      REPORT_DELIVERY_RECIPIENT_EMAIL: reportDeliveryRecipientEmail || null,
      REPORT_DELIVERY_WEBHOOK_URL_SET: Boolean(reportDeliveryWebhookUrl),
      REPORT_DELIVERY_WEBHOOK_TIMEOUT_MS: reportDeliveryWebhookTimeoutMs,
      REPORT_CACHE_ENABLED: reportCacheEnabled,
      REPORT_CACHE_TTL_MS: reportCacheTtlMs,
      REPORT_CACHE_STRATEGY_REQUESTED: reportCacheStrategy,
      REPORT_CACHE_STRATEGY_ACTIVE: reportCache.activeStrategy,
      REPORT_CACHE_REDIS_URL_SET: Boolean(reportCacheRedisUrl),
      REQUIRE_VERIFIED_CLIENT_KYC_FOR_LOAN_APPROVAL: requireVerifiedClientKycForLoanApproval,
      ALLOW_CONCURRENT_LOANS: allowConcurrentLoans,
      MOBILE_MONEY_PROVIDER: mobileMoneyProvider.providerName,
      MOBILE_MONEY_C2B_ENABLED: mobileMoneyC2BEnabled,
      MOBILE_MONEY_B2C_ENABLED: mobileMoneyB2CEnabled,
      MOBILE_MONEY_STK_ENABLED: mobileMoneyStkEnabled,
      MOBILE_MONEY_WEBHOOK_TOKEN_SET: Boolean(mobileMoneyWebhookToken),
      MOBILE_MONEY_CALLBACK_IP_WHITELIST_SET: Boolean(mobileMoneyCallbackIpWhitelist),
      MOBILE_MONEY_DARAJA_BASE_URL_SET: Boolean(mobileMoneyDarajaBaseUrl),
      MOBILE_MONEY_DARAJA_CONSUMER_KEY_SET: Boolean(mobileMoneyDarajaConsumerKey),
      MOBILE_MONEY_DARAJA_CONSUMER_SECRET_SET: Boolean(mobileMoneyDarajaConsumerSecret),
      MOBILE_MONEY_DARAJA_B2C_INITIATOR_NAME_SET: Boolean(mobileMoneyDarajaB2CInitiatorName),
      MOBILE_MONEY_DARAJA_B2C_SECURITY_CREDENTIAL_SET: Boolean(mobileMoneyDarajaB2CSecurityCredential),
      MOBILE_MONEY_DARAJA_B2C_SHORTCODE_SET: Boolean(mobileMoneyDarajaB2CShortCode),
      MOBILE_MONEY_DARAJA_B2C_RESULT_URL_SET: Boolean(mobileMoneyDarajaB2CResultUrl),
      MOBILE_MONEY_DARAJA_B2C_TIMEOUT_URL_SET: Boolean(mobileMoneyDarajaB2CTimeoutUrl),
      MOBILE_MONEY_DARAJA_STK_SHORTCODE_SET: Boolean(mobileMoneyDarajaStkShortCode),
      MOBILE_MONEY_DARAJA_STK_PASSKEY_SET: Boolean(mobileMoneyDarajaStkPasskey),
      MOBILE_MONEY_DARAJA_STK_CALLBACK_URL_SET: Boolean(mobileMoneyDarajaStkCallbackUrl),
      MOBILE_MONEY_PROVIDER_TIMEOUT_MS: mobileMoneyProviderTimeoutMs,
      MOBILE_MONEY_CIRCUIT_FAILURE_THRESHOLD: mobileMoneyCircuitFailureThreshold,
      MOBILE_MONEY_CIRCUIT_RESET_TIMEOUT_MS: mobileMoneyCircuitResetTimeoutMs,
      MOBILE_MONEY_B2C_CORE_RETRY_ENABLED: mobileMoneyB2CCoreRetryEnabled,
      MOBILE_MONEY_B2C_CORE_RETRY_INTERVAL_MS: mobileMoneyB2CCoreRetryIntervalMs,
      MOBILE_MONEY_B2C_CORE_RETRY_MIN_AGE_MS: mobileMoneyB2CCoreRetryMinAgeMs,
      MOBILE_MONEY_B2C_CORE_RETRY_BATCH_SIZE: mobileMoneyB2CCoreRetryBatchSize,
      EVENT_BROKER_PROVIDER: eventBrokerProvider,
      EVENT_BROKER_URL_SET: Boolean(eventBrokerUrl),
      EVENT_TOPIC_PREFIX: eventTopicPrefix,
      EVENT_DISPATCH_INLINE: eventDispatchInline,
      DOMAIN_EVENT_DISPATCH_ENABLED: domainEventDispatchEnabled,
      DOMAIN_EVENT_DISPATCH_INTERVAL_MS: domainEventDispatchIntervalMs,
      DOMAIN_EVENT_DISPATCH_BATCH_SIZE: domainEventDispatchBatchSize,
      DEFAULT_TENANT_ID: defaultTenantId,
      ACCOUNTING_GL_CONSUMER_ENABLED: accountingGlConsumerEnabled,
      ACCOUNTING_GL_SHADOW_MODE: accountingGlShadowMode,
      ACCOUNTING_GL_RABBITMQ_QUEUE: rabbitMqAccountingQueue,
      ACCOUNTING_GL_RABBITMQ_CONSUMER_ACTIVE: Boolean(rabbitMqAccountingConsumer),
      UPLOAD_STORAGE_DRIVER: documentStorage.driver,
      UPLOAD_MAX_FILE_SIZE_BYTES: documentStorage.maxFileSizeBytes,
      UPLOAD_LOCAL_DIR: documentStorage.localDirectory,
      UPLOAD_PUBLIC_BASE_PATH: documentStorage.localPublicBasePath,
      ENV_VALIDATION_WARNINGS: envValidationWarnings,
      CORS_ORIGINS_COUNT: corsOrigins.length,
      TRUST_PROXY_REQUESTED: trustProxyRequested,
      TRUST_PROXY_ENABLED: trustProxyEnabled,
      SENTRY_ENABLED: errorTracker.enabled,
      SENTRY_PROVIDER: errorTracker.provider,
      SENTRY_DSN_SET: Boolean(String(env.SENTRY_DSN || "").trim()),
      OTEL_TRACING_ENABLED: otelTracingEnabled,
      OTEL_EXPORTER_OTLP_ENDPOINT_SET: Boolean(otelExporterEndpoint),
      OTEL_TRACE_SAMPLE_RATIO: otelTraceSampleRatio,
      OTEL_SERVICE_NAME: otelServiceName,
      UPTIME_HEARTBEAT_ENABLED: Boolean(uptimeHeartbeatUrl),
      UPTIME_HEARTBEAT_URL_SET: Boolean(uptimeHeartbeatUrl),
      UPTIME_HEARTBEAT_INTERVAL_MS: uptimeHeartbeatIntervalMs,
      LOG_SHIPPER_ENABLED: logger.logShipperEnabled || false,
      LOG_SHIPPER_URL_SET: logger.logShipperUrlSet || false,
    };
  }

  return {
    config: {
      appVersion,
      port,
      jwtSecrets,
      databasePath,
      databaseClient,
      isInMemoryDb,
      overdueSyncIntervalMs,
      backupsRequested,
      backupsEnabled,
      backupDirectory,
      backupIntervalMs,
      backupRetentionCount,
      jobQueueEnabled,
      jobQueueRole,
      jobQueueSchedulerEnabled,
      jobQueueWorkerEnabled,
      jobQueueRedisUrl,
      jobQueueName,
      jobQueueDeadLetterQueueName,
      jobQueueConcurrency,
      jobQueueAttempts,
      jobQueueDlqInspectIntervalMs,
      jobQueueDlqAlertThreshold,
      jobQueueDlqRetryBatchSize,
      maintenanceCleanupIntervalMs,
      archiveClosedLoansAfterYears,
      purgeSoftDeletedClientsAfterDays,
      accountingBatchEnabled,
      accountingBatchIntervalMs,
      reportDeliveryRequested,
      reportDeliveryEnabled,
      reportDeliveryIntervalMs,
      reportDeliveryRecipientEmail,
      reportDeliveryWebhookUrl,
      reportDeliveryWebhookTimeoutMs,
      requireVerifiedClientKycForLoanApproval,
      allowConcurrentLoans,
      mobileMoneyProviderName: mobileMoneyProvider.providerName,
      mobileMoneyC2BEnabled,
      mobileMoneyB2CEnabled,
      mobileMoneyStkEnabled,
      mobileMoneyWebhookTokenSet: Boolean(mobileMoneyWebhookToken),
      mobileMoneyCallbackIpWhitelistSet: Boolean(mobileMoneyCallbackIpWhitelist),
      mobileMoneyDarajaBaseUrlSet: Boolean(mobileMoneyDarajaBaseUrl),
      mobileMoneyDarajaConsumerKeySet: Boolean(mobileMoneyDarajaConsumerKey),
      mobileMoneyDarajaConsumerSecretSet: Boolean(mobileMoneyDarajaConsumerSecret),
      mobileMoneyDarajaB2CInitiatorNameSet: Boolean(mobileMoneyDarajaB2CInitiatorName),
      mobileMoneyDarajaB2CSecurityCredentialSet: Boolean(mobileMoneyDarajaB2CSecurityCredential),
      mobileMoneyDarajaB2CShortCodeSet: Boolean(mobileMoneyDarajaB2CShortCode),
      mobileMoneyDarajaB2CResultUrlSet: Boolean(mobileMoneyDarajaB2CResultUrl),
      mobileMoneyDarajaB2CTimeoutUrlSet: Boolean(mobileMoneyDarajaB2CTimeoutUrl),
      mobileMoneyDarajaStkShortCodeSet: Boolean(mobileMoneyDarajaStkShortCode),
      mobileMoneyDarajaStkPasskeySet: Boolean(mobileMoneyDarajaStkPasskey),
      mobileMoneyDarajaStkCallbackUrlSet: Boolean(mobileMoneyDarajaStkCallbackUrl),
      mobileMoneyProviderTimeoutMs,
      mobileMoneyCircuitFailureThreshold,
      mobileMoneyCircuitResetTimeoutMs,
      mobileMoneyB2CCoreRetryEnabled,
      mobileMoneyB2CCoreRetryIntervalMs,
      mobileMoneyB2CCoreRetryMinAgeMs,
      mobileMoneyB2CCoreRetryBatchSize,
      eventBrokerProvider,
      eventBrokerUrlSet: Boolean(eventBrokerUrl),
      eventTopicPrefix,
      eventDispatchInline,
      domainEventDispatchEnabled,
      domainEventDispatchIntervalMs,
      domainEventDispatchBatchSize,
      defaultTenantId,
      uptimeHeartbeatUrl,
      uptimeHeartbeatIntervalMs,
      accountingGlConsumerEnabled,
      accountingGlShadowMode,
      rabbitMqAccountingQueue,
    },
    db: {
      run,
      get,
      all,
      executeTransaction,
      initSchema,
      runMigrations,
      closeDb,
      backupDatabase,
    },
    services: {
      logger,
      errorTracker,
      metrics,
      reportCache,
      documentStorage,
      scheduledReportService,
      domainEventService,
      serviceRegistry,
    },
    middleware: {
      generalApiLimiter,
      errorHandler,
    },
    routeDepsBase,
    buildConfigStatus,
    /**
     * Gracefully stops all message-broker consumers started during bootstrap.
     * Called by lifecycle.ts on SIGINT/SIGTERM before the HTTP server closes.
     * Uses allSettled so one failure doesn't block the others.
     */
    stopConsumers: async (): Promise<void> => {
      await Promise.allSettled([
        rabbitMqNotificationsConsumer?.stop(),
        rabbitMqAccountingConsumer?.stop(),
      ]);
    },
  };
}

export {
  createBootstrapContext,
};
