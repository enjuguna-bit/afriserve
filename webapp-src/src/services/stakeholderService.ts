/**
 * stakeholderService.ts
 * Shared business-logic helpers for the guarantor / collateral-asset domain.
 * Consumed by clientRouteService.ts and loanCollateralRouteService.ts to
 * eliminate duplication and enforce invariants uniformly.
 */

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type LoanUnderwritingServiceLike = { refreshLoanAssessment: (loanId: number) => Promise<unknown> };

// ─── Onboarding derivation ────────────────────────────────────────────────────
// Single authoritative implementation — mirrors
// src/domain/client/value-objects/OnboardingStatus.ts

export type OnboardingParams = {
  kycStatus: string;
  hasGuarantor: boolean;
  hasCollateral: boolean;
  feesPaid: boolean;
};

export function deriveOnboardingStatus(params: OnboardingParams): string {
  const kyc = String(params.kycStatus || "pending").trim().toLowerCase();
  if (kyc === "verified" && params.hasGuarantor && params.hasCollateral && params.feesPaid) {
    return "complete";
  }
  if (kyc === "verified") return "kyc_verified";
  if (["in_review", "rejected", "suspended"].includes(kyc)) return "kyc_pending";
  return "registered";
}

export function deriveOnboardingNextStep(params: OnboardingParams): string | null {
  const kyc = String(params.kycStatus || "pending").trim().toLowerCase();
  if (kyc !== "verified") {
    if (kyc === "in_review") return "complete_kyc_review";
    if (kyc === "rejected") return "resubmit_kyc";
    if (kyc === "suspended") return "resolve_kyc_hold";
    return "start_kyc";
  }
  if (!params.hasGuarantor) return "add_guarantor";
  if (!params.hasCollateral) return "add_collateral";
  if (!params.feesPaid) return "record_fee_payment";
  return null;
}

// ─── Uniqueness guards ────────────────────────────────────────────────────────

/**
 * Returns true when the national ID is available (no conflict).
 * Returns false when another guarantor already holds this ID.
 */
export async function checkGuarantorNationalIdUnique(
  get: DbGet,
  nationalId: unknown,
  excludeId: number | null = null,
): Promise<boolean> {
  if (!nationalId) return true;
  const normalized = String(nationalId).trim().toLowerCase();
  const existing = await get(
    `SELECT id FROM guarantors WHERE LOWER(TRIM(COALESCE(national_id, ''))) = ?${excludeId ? " AND id != ?" : ""}`,
    excludeId ? [normalized, excludeId] : [normalized],
  );
  return !existing;
}

export type CollateralUniquePayload = {
  registrationNumber?: string | null;
  logbookNumber?: string | null;
  titleNumber?: string | null;
};

export type CollateralUniqueConflict = {
  field: "registrationNumber" | "logbookNumber" | "titleNumber";
  message: string;
} | null;

/**
 * Returns a conflict descriptor when any unique identifier is already taken.
 * Pass excludeId on update paths (skip the record being edited).
 */
export async function checkCollateralAssetUnique(
  get: DbGet,
  payload: CollateralUniquePayload,
  excludeId: number | null = null,
): Promise<CollateralUniqueConflict> {
  const excl = excludeId ? " AND id != ?" : "";
  const ep   = excludeId ? [excludeId] : [];

  if (payload.registrationNumber) {
    const row = await get(
      `SELECT id FROM collateral_assets WHERE LOWER(TRIM(COALESCE(registration_number, ''))) = LOWER(TRIM(?))${excl}`,
      [payload.registrationNumber, ...ep],
    );
    if (row) return { field: "registrationNumber", message: "A collateral asset with this registration number already exists" };
  }
  if (payload.logbookNumber) {
    const row = await get(
      `SELECT id FROM collateral_assets WHERE LOWER(TRIM(COALESCE(logbook_number, ''))) = LOWER(TRIM(?))${excl}`,
      [payload.logbookNumber, ...ep],
    );
    if (row) return { field: "logbookNumber", message: "A collateral asset with this logbook number already exists" };
  }
  if (payload.titleNumber) {
    const row = await get(
      `SELECT id FROM collateral_assets WHERE LOWER(TRIM(COALESCE(title_number, ''))) = LOWER(TRIM(?))${excl}`,
      [payload.titleNumber, ...ep],
    );
    if (row) return { field: "titleNumber", message: "A collateral asset with this title number already exists" };
  }
  return null;
}

// ─── Assessment refresh helpers ───────────────────────────────────────────────

async function _refreshForLoanIds(
  loanUnderwritingService: LoanUnderwritingServiceLike,
  loanIds: number[],
): Promise<void> {
  const unique = [...new Set(loanIds.filter((id) => Number.isInteger(id) && id > 0))];
  for (const id of unique) {
    try {
      await loanUnderwritingService.refreshLoanAssessment(id);
    } catch {
      // Best-effort — refresh must never block the primary operation.
    }
  }
}

export async function refreshAssessmentsForGuarantor(
  all: DbAll,
  loanUnderwritingService: LoanUnderwritingServiceLike,
  guarantorId: number,
): Promise<void> {
  const rows = await all(
    "SELECT DISTINCT loan_id FROM loan_guarantors WHERE guarantor_id = ?",
    [guarantorId],
  );
  await _refreshForLoanIds(loanUnderwritingService, rows.map((r) => Number(r.loan_id)));
}

export async function refreshAssessmentsForCollateral(
  all: DbAll,
  loanUnderwritingService: LoanUnderwritingServiceLike,
  collateralAssetId: number,
): Promise<void> {
  const rows = await all(
    "SELECT DISTINCT loan_id FROM loan_collaterals WHERE collateral_asset_id = ?",
    [collateralAssetId],
  );
  await _refreshForLoanIds(loanUnderwritingService, rows.map((r) => Number(r.loan_id)));
}

export async function refreshAssessmentsForLoan(
  loanUnderwritingService: LoanUnderwritingServiceLike,
  loanId: number,
): Promise<void> {
  await _refreshForLoanIds(loanUnderwritingService, [loanId]);
}

// ─── Graduated loan limit ─────────────────────────────────────────────────────
// Extracted from clientRouteService — N+1 fixed by batching all repayment rows.

const GRADUATION_THRESHOLDS = {
  EXCELLENT_REPAYMENT_RATIO:   0.98,
  GOOD_REPAYMENT_RATIO:        0.95,
  CONSISTENT_REPAYMENT_RATIO:  0.97,
  MAX_AVG_DAYS_BETWEEN_PAYMENTS: 8,
  HIGH_LIMIT_KES:     3_000,
  STANDARD_LIMIT_KES: 2_000,
} as const;

export async function computeGraduatedLimitForClient(
  clientId: number,
  all: DbAll,
): Promise<number> {
  const loans = await all(
    `SELECT id, status, principal, expected_total FROM loans
     WHERE client_id = ? ORDER BY disbursed_at ASC, id ASC`,
    [clientId],
  );
  const closedLoans = (loans || []).filter((l) => String(l.status) === "closed");
  if (closedLoans.length === 0) return 0;

  const closedIds = closedLoans.map((l) => Number(l.id));
  const allRepayments = await all(
    `SELECT loan_id, amount, paid_at FROM repayments
     WHERE loan_id IN (${closedIds.map(() => "?").join(",")})
     ORDER BY loan_id, paid_at ASC`,
    closedIds,
  );

  const byLoan = new Map<number, Array<{ amount: number; paid_at: string }>>();
  for (const r of allRepayments) {
    const lid = Number(r.loan_id);
    if (!byLoan.has(lid)) byLoan.set(lid, []);
    byLoan.get(lid)!.push({ amount: Number(r.amount || 0), paid_at: String(r.paid_at) });
  }

  function metrics(loanId: number, expectedTotal: number) {
    const reps = byLoan.get(loanId) || [];
    const totalRepaid = reps.reduce((s, r) => s + r.amount, 0);
    const ratio = expectedTotal > 0 ? totalRepaid / expectedTotal : 0;
    let avgDays: number | null = null;
    if (reps.length > 1) {
      let days = 0;
      for (let i = 1; i < reps.length; i++) {
        days += (new Date(reps[i].paid_at).getTime() - new Date(reps[i - 1].paid_at).getTime()) / 86_400_000;
      }
      avgDays = days / (reps.length - 1);
    }
    return { ratio, avgDays };
  }

  const T = GRADUATION_THRESHOLDS;

  if (closedLoans.length === 1) {
    const last = closedLoans[0];
    const { ratio, avgDays } = metrics(Number(last.id), Number(last.expected_total || 0));
    if (ratio >= T.EXCELLENT_REPAYMENT_RATIO && avgDays !== null && avgDays <= T.MAX_AVG_DAYS_BETWEEN_PAYMENTS) {
      return T.HIGH_LIMIT_KES;
    }
    if (ratio >= T.GOOD_REPAYMENT_RATIO) return T.STANDARD_LIMIT_KES;
    return Number(last.principal || 0);
  }

  const recentTwo = closedLoans.slice(-2);
  const allGood = recentTwo.every((loan) => {
    const { ratio, avgDays } = metrics(Number(loan.id), Number(loan.expected_total || 0));
    return ratio >= T.CONSISTENT_REPAYMENT_RATIO && avgDays !== null && avgDays <= T.MAX_AVG_DAYS_BETWEEN_PAYMENTS;
  });
  return allGood ? T.HIGH_LIMIT_KES : T.STANDARD_LIMIT_KES;
}

