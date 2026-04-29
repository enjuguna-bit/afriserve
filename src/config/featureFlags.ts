/**
 * Feature Flags — environment-variable-backed runtime toggles.
 *
 * WHY THIS EXISTS (Gap 6 from the system audit):
 *   New CQRS command handlers, the OutboxEventBus, and the
 *   LoanDisbursementSaga exist alongside the original service layer.
 *   Without a flag system, every cutover is all-or-nothing: a bug in a
 *   new handler takes the whole operation down with no rollback path.
 *
 * DESIGN:
 *   - Every flag is a boolean read from an environment variable.
 *   - The env var name is `FEATURE_<FLAG_NAME>` (upper-snake-case).
 *   - Default is always the safe/backward-compatible value (false = old path).
 *   - Flags are read once at startup and cached — no runtime mutation.
 *   - The entire flag set is exported as a plain object so it can be injected
 *     into serviceRegistry and bootstrap without global state.
 *
 * USAGE:
 *   import { readFeatureFlags } from "../config/featureFlags.js";
 *   const flags = readFeatureFlags();
 *   if (flags.useLoanCommandHandlers) { ... new path ... } else { ... old ... }
 *
 * ADDING A NEW FLAG:
 *   1. Add the key + JSDoc to FeatureFlags below.
 *   2. Add the env-var read to readFeatureFlags().
 *   3. Add the default to DEFAULT_FEATURE_FLAGS.
 *   4. Document the env var in .env.example.
 */

export interface FeatureFlags {
  /**
   * Route loan creation through the new CreateLoanApplicationHandler
   * (domain aggregate + ILoanRepository) instead of loanService.createLoan.
   * Env: FEATURE_USE_LOAN_COMMAND_HANDLERS=true
   */
  useLoanCommandHandlers: boolean;

  /**
   * Route client creation through the new CreateClientHandler
   * (domain aggregate + IClientRepository.create()) instead of the raw SQL
   * path in clientRouteService.createClient.
   * Env: FEATURE_USE_CLIENT_COMMAND_HANDLERS=true
   */
  useClientCommandHandlers: boolean;

  /**
   * Enable the LoanDisbursementSaga auto-fire on loan.approved events.
   * When false (default), approval events do not auto-disburse and the direct
   * disburse route remains the only disbursement path.
   * Env: FEATURE_SAGA_AUTO_DISBURSE=true
   */
  sagaAutoDisburse: boolean;

  /**
   * Use OutboxEventBus for domain event publishing.
   * When false, falls back to InMemoryEventBus (useful for isolated unit tests
   * that don't have a DB connection but still test event bus behaviour).
   * NOTE: serviceRegistry always uses OutboxEventBus regardless of this flag.
   * This flag is intended for test helpers and local-dev overrides only.
   * Env: FEATURE_USE_OUTBOX_EVENT_BUS=true
   */
  useOutboxEventBus: boolean;

  /**
   * Require verified KYC before a loan can be approved.
   * Mirrors the existing requireVerifiedClientKycForLoanApproval bootstrap
   * option — kept here for completeness so all toggles live in one place.
   * Env: REQUIRE_VERIFIED_KYC_FOR_LOAN_APPROVAL=true  (existing var)
   */
  requireVerifiedKycForLoanApproval: boolean;

  /**
   * Block concurrent loan applications (pending_approval + approved + active).
   * Mirrors the existing allowConcurrentLoans bootstrap option (negated).
   * Env: ALLOW_CONCURRENT_LOANS=false  (existing var, negated)
   */
  blockConcurrentLoans: boolean;
}

export const DEFAULT_FEATURE_FLAGS: Readonly<FeatureFlags> = {
  useLoanCommandHandlers:         false,
  useClientCommandHandlers:       false,
  sagaAutoDisburse:               false,
  useOutboxEventBus:              true,   // OutboxEventBus is the production default
  requireVerifiedKycForLoanApproval: false,
  blockConcurrentLoans:           true,
};

/**
 * Read all feature flags from the current process environment.
 * Call once at startup; pass the result object wherever flags are needed.
 */
export function readFeatureFlags(env: NodeJS.ProcessEnv = process.env): FeatureFlags {
  const bool = (key: string, defaultVal: boolean): boolean => {
    const raw = String(env[key] ?? "").trim().toLowerCase();
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return defaultVal;
  };

  return {
    useLoanCommandHandlers:         bool("FEATURE_USE_LOAN_COMMAND_HANDLERS",   DEFAULT_FEATURE_FLAGS.useLoanCommandHandlers),
    useClientCommandHandlers:       bool("FEATURE_USE_CLIENT_COMMAND_HANDLERS", DEFAULT_FEATURE_FLAGS.useClientCommandHandlers),
    sagaAutoDisburse:               bool("FEATURE_SAGA_AUTO_DISBURSE",          DEFAULT_FEATURE_FLAGS.sagaAutoDisburse),
    useOutboxEventBus:              bool("FEATURE_USE_OUTBOX_EVENT_BUS",        DEFAULT_FEATURE_FLAGS.useOutboxEventBus),
    requireVerifiedKycForLoanApproval: bool(
      "REQUIRE_VERIFIED_KYC_FOR_LOAN_APPROVAL",
      DEFAULT_FEATURE_FLAGS.requireVerifiedKycForLoanApproval,
    ),
    blockConcurrentLoans: !bool("ALLOW_CONCURRENT_LOANS", !DEFAULT_FEATURE_FLAGS.blockConcurrentLoans),
  };
}

/**
 * Singleton — call once at bootstrap and cache.
 * Do not call inside hot paths (per-request).
 */
let _cached: FeatureFlags | null = null;

export function getFeatureFlags(): FeatureFlags {
  if (!_cached) {
    _cached = readFeatureFlags();
  }
  return _cached;
}

/** Reset the cache — useful in tests that override process.env between cases. */
export function resetFeatureFlagCache(): void {
  _cached = null;
}
