/**
 * ClientOnboardingSaga
 *
 * WHY THIS EXISTS (Gap 9 from the system audit):
 *   `syncClientOnboardingStatus()` is called manually 9 times scattered
 *   across clientRouteService.ts — after every KYC update, fee payment,
 *   guarantor add/update, and collateral add/update. This means:
 *     a. Any new domain event that should trigger an onboarding re-sync
 *        requires a code change in the route service.
 *     b. If a domain operation fires an event but the caller forgets to
 *        call sync, the onboarding_status row drifts out of sync.
 *
 * WHAT IT DOES:
 *   Subscribes to all domain events that can change onboarding eligibility
 *   and automatically re-syncs the client's onboarding_status row.
 *
 *   Events handled:
 *     client.kyc_updated        — KYC transition may unblock or block approval
 *     client.fees_paid          — fee payment is an onboarding blocker
 *     client.profile_updated    — profile changes can affect completeness
 *     client.guarantor_added    — guarantor count affects readiness
 *     client.guarantor_updated  — guarantee amount affects readiness
 *     client.collateral_added   — collateral count affects readiness
 *     client.collateral_updated — collateral status affects readiness
 *
 * INVOCATION:
 *   Call register(eventBus) once at bootstrap.
 *   The existing manual sync calls in clientRouteService.ts continue to
 *   work — they are idempotent and will be removed incrementally as
 *   routes are migrated to CQRS handlers.
 *
 * SYNC IMPLEMENTATION:
 *   Uses the same raw SQL logic as syncClientOnboardingStatus() in
 *   clientRouteService.ts, extracted here as a self-contained method
 *   so the saga has no dependency on the route service.
 */
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbRun = (sql: string, params?: unknown[]) => Promise<any>;

// The onboarding step sequence — mirrors deriveOnboardingStatus in clientRouteService
const ONBOARDING_STEPS = ["registered", "kyc_pending", "kyc_verified", "fees_paid", "complete"] as const;
type OnboardingStep = typeof ONBOARDING_STEPS[number];

export class ClientOnboardingSaga {
  constructor(
    private readonly get: DbGet,
    private readonly run: DbRun,
  ) {}

  register(eventBus: IEventBus): void {
    const handle = async (event: any) => {
      const clientId = this._extractClientId(event);
      if (!clientId) return;
      await this._syncOnboardingStatus(clientId).catch(() => {
        // Best-effort — must not disrupt the main operation
      });
    };

    const events = [
      "client.kyc_updated",
      "client.fees_paid",
      "client.profile_updated",
      "client.guarantor_added",
      "client.guarantor_updated",
      "client.collateral_added",
      "client.collateral_updated",
    ];

    for (const eventType of events) {
      eventBus.subscribe(eventType, handle);
    }
  }

  // ── Core sync logic ────────────────────────────────────────────────────

  async syncForClient(clientId: number): Promise<string> {
    return this._syncOnboardingStatus(clientId);
  }

  private async _syncOnboardingStatus(clientId: number): Promise<string> {
    const progress = await this._loadProgress(clientId);
    if (!progress) return "registered";

    if (progress.nextStatus !== progress.currentStatus) {
      await this.run(
        "UPDATE clients SET onboarding_status = ?, updated_at = ? WHERE id = ?",
        [progress.nextStatus, new Date().toISOString(), clientId],
      );
    }
    return progress.nextStatus;
  }

  private async _loadProgress(clientId: number): Promise<{
    currentStatus: string;
    nextStatus: OnboardingStep;
    kycStatus: string;
    feePaymentStatus: string;
    feesPaidAt: string | null;
    guarantorCount: number;
    collateralCount: number;
  } | null> {
    const client = await this.get(
      `SELECT onboarding_status, kyc_status, fee_payment_status, fees_paid_at
       FROM clients WHERE id = ? LIMIT 1`,
      [clientId],
    );
    if (!client) return null;

    const [guarantorRow, collateralRow] = await Promise.all([
      this.get(
        "SELECT COUNT(*) AS cnt FROM guarantors WHERE client_id = ? AND is_active = 1",
        [clientId],
      ),
      this.get(
        "SELECT COUNT(*) AS cnt FROM collateral_assets WHERE client_id = ? AND status = 'active'",
        [clientId],
      ),
    ]);

    const kycStatus        = String(client.kyc_status        ?? "pending").toLowerCase();
    const feePaymentStatus = String(client.fee_payment_status ?? "unpaid").toLowerCase();
    const guarantorCount   = Number(guarantorRow?.cnt  ?? 0);
    const collateralCount  = Number(collateralRow?.cnt ?? 0);

    // Derive the correct onboarding status
    let nextStatus: OnboardingStep = "registered";
    if (kycStatus === "verified") {
      if (feePaymentStatus === "paid") {
        if (guarantorCount > 0 && collateralCount > 0) {
          nextStatus = "complete";
        } else {
          nextStatus = "fees_paid";
        }
      } else {
        nextStatus = "kyc_verified";
      }
    } else if (kycStatus === "pending" || kycStatus === "in_review") {
      nextStatus = "kyc_pending";
    }

    return {
      currentStatus:   String(client.onboarding_status ?? "registered"),
      nextStatus,
      kycStatus,
      feePaymentStatus,
      feesPaidAt:      client.fees_paid_at ? String(client.fees_paid_at) : null,
      guarantorCount,
      collateralCount,
    };
  }

  private _extractClientId(event: any): number | null {
    // Try several common payload shapes
    const id = event?.aggregateId
      ?? event?.payload?.clientId
      ?? event?.clientId;
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
}
