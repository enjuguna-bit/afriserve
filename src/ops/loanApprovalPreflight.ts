import { dbClient, get } from "../db/connection.js";
import { prisma } from "../db/prismaClient.js";
import { getCurrentTenantId, runWithTenant } from "../utils/tenantStore.js";

function parseRequiredPositiveInt(value: string | undefined, label: string): number {
  const parsed = Number(value || 0);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

async function main() {
  if (dbClient !== "postgres") {
    throw new Error("loanApprovalPreflight only supports Postgres deployments.");
  }

  const loanId = parseRequiredPositiveInt(process.argv[2], "loanId");
  const userId = parseRequiredPositiveInt(process.argv[3], "userId");
  const tenantId = String(process.argv[4] || "default").trim() || "default";

  const result = await runWithTenant(tenantId, async () => {
    const currentTenantId = getCurrentTenantId();
    const approver = await get(
      `
        SELECT id, role, token_version, is_active
        FROM users
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `,
      [userId, currentTenantId],
    );

    const loan = await prisma.loans.findUnique({ where: { id: loanId } });
    if (!loan) {
      return {
        status: "ok",
        tenantId: currentTenantId,
        loanFound: false,
        approver,
      };
    }

    const [
      clientRow,
      clientGuarantorCountRow,
      clientCollateralCountRow,
      loanGuarantorCountRow,
      loanCollateralCountRow,
    ] = await Promise.all([
      get(
        `
          SELECT id, kyc_status, fee_payment_status, fees_paid_at
          FROM clients
          WHERE id = ? AND tenant_id = ?
          LIMIT 1
        `,
        [Number(loan.client_id || 0), currentTenantId],
      ),
      get(
        `
          SELECT COUNT(*)::int AS total
          FROM guarantors
          WHERE client_id = ? AND tenant_id = ? AND COALESCE(is_active, 1) = 1
        `,
        [Number(loan.client_id || 0), currentTenantId],
      ),
      get(
        `
          SELECT COUNT(*)::int AS total
          FROM collateral_assets
          WHERE client_id = ?
            AND tenant_id = ?
            AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')
        `,
        [Number(loan.client_id || 0), currentTenantId],
      ),
      get(
        `
          SELECT COUNT(*)::int AS total
          FROM loan_guarantors
          WHERE loan_id = ? AND tenant_id = ?
        `,
        [loanId, currentTenantId],
      ),
      get(
        `
          SELECT COUNT(*)::int AS total
          FROM loan_collaterals
          WHERE loan_id = ? AND tenant_id = ?
        `,
        [loanId, currentTenantId],
      ),
    ]);

    const clientGuarantorCount = Number(clientGuarantorCountRow?.total || 0);
    const clientCollateralCount = Number(clientCollateralCountRow?.total || 0);
    const loanGuarantorCount = Number(loanGuarantorCountRow?.total || 0);
    const loanCollateralCount = Number(loanCollateralCountRow?.total || 0);
    const kycStatus = String(clientRow?.kyc_status || "pending").trim().toLowerCase();
    const feesPaid = String(clientRow?.fee_payment_status || "unpaid").trim().toLowerCase() === "paid";
    const approverRole = String(approver?.role || "").trim().toLowerCase();
    const approverIsActive = Number(approver?.is_active || 0) === 1;
    const makerCheckerSatisfied = approverRole === "admin"
      || (
        Number(loan.created_by_user_id || 0) !== userId
        && Number(loan.officer_id || 0) !== userId
      );

    const approvalBlockers: string[] = [];
    if (kycStatus !== "verified") {
      approvalBlockers.push("Verify client KYC");
    }
    if (clientGuarantorCount < 1) {
      approvalBlockers.push("Add at least one client guarantor");
    }
    if (clientCollateralCount < 2) {
      approvalBlockers.push("Add at least 2 client collateral assets");
    }
    if (!feesPaid) {
      approvalBlockers.push("Record client onboarding fee payment");
    }
    if (clientGuarantorCount > 0 && loanGuarantorCount <= 0) {
      approvalBlockers.push("Link at least one guarantor to the loan");
    }
    if (clientCollateralCount > 0 && loanCollateralCount <= 0) {
      approvalBlockers.push("Link at least one collateral asset to the loan");
    }

    const hasUpdatedAt = Object.prototype.hasOwnProperty.call(loan, "updated_at");
    const hasWrittenOffAt = Object.prototype.hasOwnProperty.call(loan, "written_off_at");

    return {
      status: "ok",
      tenantId: currentTenantId,
      loanFound: true,
      approver,
      loanId: loan.id,
      loanStatus: loan.status,
      branchId: loan.branch_id,
      clientId: loan.client_id,
      prismaReadOk: true,
      hasUpdatedAt,
      hasWrittenOffAt,
      updatedAtIsNull: loan.updated_at == null,
      writtenOffAtIsNull: loan.written_off_at == null,
      clientKycStatus: kycStatus,
      clientGuarantorCount,
      clientCollateralCount,
      loanGuarantorCount,
      loanCollateralCount,
      feesPaid,
      approverIsActive,
      makerCheckerSatisfied,
      approvalBlockers,
      canApprove: approverIsActive
        && makerCheckerSatisfied
        && String(loan.status || "").trim().toLowerCase() === "pending_approval"
        && approvalBlockers.length === 0,
    };
  });

  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
