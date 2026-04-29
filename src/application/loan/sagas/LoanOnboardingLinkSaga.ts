import { DomainValidationError } from "../../../domain/errors.js";
import type { LoanApplicationSubmitted } from "../../../domain/loan/events/LoanApplicationSubmitted.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import type { DbTransactionContext } from "../../../types/dataLayer.js";
import type { DbExecuteTransaction } from "../../../types/serviceContracts.js";
import { getCurrentTenantId } from "../../../utils/tenantStore.js";

type LoanApplicationSubmittedLike = Pick<
  LoanApplicationSubmitted,
  "loanId" | "clientId" | "createdByUserId" | "occurredAt"
>;

type LoanOnboardingLinkSagaDeps = {
  executeTransaction: DbExecuteTransaction;
};

type LoanOnboardingLinkSagaHandleOptions = {
  strict?: boolean;
};

export class LoanOnboardingLinkSaga {
  constructor(private readonly deps: LoanOnboardingLinkSagaDeps) {}

  register(eventBus: IEventBus): void {
    eventBus.subscribe<LoanApplicationSubmitted>("loan.application.submitted", async (event) => {
      await this.handle(event, undefined, { strict: false });
    });
  }

  async handle(
    event: LoanApplicationSubmittedLike,
    tx?: DbTransactionContext,
    options: LoanOnboardingLinkSagaHandleOptions = {},
  ): Promise<void> {
    const applyLinks = async (db: DbTransactionContext) => {
      const strict = options.strict ?? true;
      const tenantId = getCurrentTenantId();
      const createdAt = String(event.occurredAt || new Date().toISOString());

      const guarantors = await db.all(
        `SELECT id, guarantee_amount
         FROM guarantors
         WHERE client_id = ? AND tenant_id = ? AND COALESCE(is_active, 1) = 1`,
        [Number(event.clientId), tenantId],
      );

      const guarantorsMissingCoverage = guarantors
        .filter((guarantor) => Number(guarantor["guarantee_amount"] || 0) <= 0)
        .map((guarantor) => Number(guarantor["id"] || 0))
        .filter((guarantorId) => Number.isInteger(guarantorId) && guarantorId > 0);
      if (strict && guarantorsMissingCoverage.length > 0) {
        throw new DomainValidationError(
          "All onboarding guarantors must have a positive guarantee amount before loan creation",
          { guarantorIds: guarantorsMissingCoverage },
        );
      }

      const eligibleGuarantors = guarantors.filter(
        (guarantor) => Number(guarantor["guarantee_amount"] || 0) > 0,
      );

      for (const guarantor of eligibleGuarantors) {
        await db.run(
          `INSERT INTO loan_guarantors (
             tenant_id, loan_id, guarantor_id, guarantee_amount,
             liability_type, note, created_by_user_id, created_at
           ) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(loan_id, guarantor_id) DO NOTHING`,
          [
            tenantId,
            Number(event.loanId),
            Number(guarantor["id"] || 0),
            Number(guarantor["guarantee_amount"] || 0),
            "individual",
            "Auto-linked from client onboarding guarantor",
            Number(event.createdByUserId || 0) || null,
            createdAt,
          ],
        );
      }

      const collaterals = await db.all(
        `SELECT id, status
         FROM collateral_assets
         WHERE client_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')`,
        [Number(event.clientId), tenantId],
      );

      for (const collateral of collaterals) {
        await db.run(
          `INSERT INTO loan_collaterals (
             tenant_id, loan_id, collateral_asset_id, forced_sale_value,
             lien_rank, note, created_by_user_id, created_at
           ) VALUES (?,?,?,?,?,?,?,?)
           ON CONFLICT(loan_id, collateral_asset_id) DO NOTHING`,
          [
            tenantId,
            Number(event.loanId),
            Number(collateral["id"] || 0),
            null,
            1,
            "Auto-linked from client onboarding collateral",
            Number(event.createdByUserId || 0) || null,
            createdAt,
          ],
        );
      }

      const releasedIds = collaterals
        .filter((collateral) => String(collateral["status"] || "").trim().toLowerCase() === "released")
        .map((collateral) => Number(collateral["id"] || 0))
        .filter((collateralId) => Number.isInteger(collateralId) && collateralId > 0);

      if (releasedIds.length > 0) {
        const placeholders = releasedIds.map(() => "?").join(", ");
        await db.run(
          `UPDATE collateral_assets
           SET status = 'active', updated_at = ?
           WHERE tenant_id = ? AND id IN (${placeholders})`,
          [createdAt, tenantId, ...releasedIds],
        );
      }
    };

    if (tx) {
      await applyLinks(tx);
      return;
    }

    await this.deps.executeTransaction(async (db) => {
      await applyLinks(db);
    });
  }
}
