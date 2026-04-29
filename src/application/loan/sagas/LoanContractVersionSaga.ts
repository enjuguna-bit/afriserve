import { LoanNotFoundError } from "../../../domain/errors.js";
import type { LoanApplicationSubmitted } from "../../../domain/loan/events/LoanApplicationSubmitted.js";
import type { IEventBus } from "../../../infrastructure/events/IEventBus.js";
import { buildLoanContractSnapshotTx, recordLoanContractVersionTx } from "../../../services/loanContractVersioning.js";
import { getClientOnboardingSnapshot } from "../../../services/loanWorkflowSnapshotService.js";
import type { DbTransactionContext } from "../../../types/dataLayer.js";
import type { DbExecuteTransaction, DbGet } from "../../../types/serviceContracts.js";
import { getCurrentTenantId } from "../../../utils/tenantStore.js";

type LoanApplicationSubmittedLike = Pick<
  LoanApplicationSubmitted,
  "loanId" | "clientId" | "principal" | "termWeeks" | "createdByUserId"
>;

type LoanContractVersionSagaDeps = {
  executeTransaction: DbExecuteTransaction;
};

type LoanContractVersionSagaHandleOptions = {
  strict?: boolean;
};

export class LoanContractVersionSaga {
  constructor(private readonly deps: LoanContractVersionSagaDeps) {}

  register(eventBus: IEventBus): void {
    eventBus.subscribe<LoanApplicationSubmitted>("loan.application.submitted", async (event) => {
      await this.handle(event, undefined, { strict: false });
    });
  }

  async handle(
    event: LoanApplicationSubmittedLike,
    tx?: DbTransactionContext,
    options: LoanContractVersionSagaHandleOptions = {},
  ): Promise<void> {
    const recordVersion = async (db: DbTransactionContext) => {
      const strict = options.strict ?? true;
      const tenantId = getCurrentTenantId();
      const existingCreationVersion = await db.get(
        `SELECT id
         FROM loan_contract_versions
         WHERE loan_id = ? AND event_type = ?
         LIMIT 1`,
        [Number(event.loanId), "creation"],
      );

      if (existingCreationVersion) {
        return;
      }

      const loan = await db.get(
        `SELECT
           l.id,
           l.client_id,
           l.product_id,
           l.branch_id,
           l.officer_id,
           l.principal,
           l.interest_rate,
           l.term_weeks,
           l.expected_total,
           l.repaid_total,
           l.balance,
           lp.name AS product_name
         FROM loans l
         LEFT JOIN loan_products lp
           ON lp.id = l.product_id
          AND lp.tenant_id = l.tenant_id
         WHERE l.id = ? AND l.tenant_id = ?
         LIMIT 1`,
        [Number(event.loanId), tenantId],
      );

      if (!loan) {
        if (!strict) {
          return;
        }
        throw new LoanNotFoundError();
      }

      const onboarding = await getClientOnboardingSnapshot({
        get: db.get as DbGet,
        clientId: Number(loan["client_id"] || event.clientId),
      });

      const snapshot = await buildLoanContractSnapshotTx(db, Number(event.loanId), {
        onboarding: onboarding
          ? {
              status: onboarding.onboarding_status,
              blockers: onboarding.blockers,
              guarantorCount: onboarding.guarantor_count,
              collateralCount: onboarding.collateral_count,
              readyForLoanApplication: onboarding.ready_for_loan_application,
            }
          : null,
        product: {
          id: loan["product_id"] == null ? null : Number(loan["product_id"]),
          name: loan["product_name"] ? String(loan["product_name"]) : null,
        },
        branchId: loan["branch_id"] == null ? null : Number(loan["branch_id"]),
        officerId: loan["officer_id"] == null ? null : Number(loan["officer_id"]),
      });

      await recordLoanContractVersionTx(db, {
        loanId: Number(event.loanId),
        eventType: "creation",
        note: "Loan application created",
        createdByUserId: Number(event.createdByUserId || 0) || null,
        snapshotJson: snapshot,
        principal: Number(loan["principal"] || event.principal || 0),
        interestRate: Number(loan["interest_rate"] || 0),
        termWeeks: Number(loan["term_weeks"] || event.termWeeks || 0),
        expectedTotal: Number(loan["expected_total"] || 0),
        repaidTotal: Number(loan["repaid_total"] || 0),
        balance: Number(loan["balance"] || 0),
      });
    };

    if (tx) {
      await recordVersion(tx);
      return;
    }

    await this.deps.executeTransaction(async (db) => {
      await recordVersion(db);
    });
  }
}
