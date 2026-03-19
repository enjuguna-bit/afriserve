import type { DbRunResult } from "../types/dataLayer.js";

type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
type DbRun = (sql: string, params?: unknown[]) => Promise<DbRunResult>;

type LoanUnderwritingAssessment = {
  loan_id: number;
  client_id: number;
  branch_id: number | null;
  principal: number;
  expected_total: number;
  balance: number;
  term_weeks: number;
  guarantor_count: number;
  collateral_count: number;
  support_income_total: number;
  estimated_weekly_installment: number;
  estimated_monthly_installment: number;
  repayment_to_support_income_ratio: number | null;
  collateral_value_total: number;
  collateral_coverage_ratio: number | null;
  guarantee_amount_total: number;
  guarantee_coverage_ratio: number | null;
  business_years: number | null;
  kyc_status: string;
  risk_band: string;
  policy_decision: string;
  policy_flags: string[];
  override_decision: string | null;
  override_reason: string | null;
  assessed_at: string;
  updated_at: string;
};

function createLoanUnderwritingService(options: {
  get: DbGet;
  run: DbRun;
}) {
  const { get, run } = options;

  function toMoney(value: unknown): number {
    const normalized = Number(value || 0);
    if (!Number.isFinite(normalized)) {
      return 0;
    }
    return Number(normalized.toFixed(2));
  }

  function toRatio(numerator: number, denominator: number): number | null {
    if (!(Number.isFinite(numerator) && Number.isFinite(denominator)) || denominator <= 0) {
      return null;
    }
    return Number((numerator / denominator).toFixed(4));
  }

  function derivePolicy(payload: {
    kycStatus: string;
    businessYears: number | null;
    guarantorCount: number;
    collateralCount: number;
    supportIncomeTotal: number;
    repaymentToSupportIncomeRatio: number | null;
    collateralCoverageRatio: number | null;
    guaranteeCoverageRatio: number | null;
  }): {
    riskBand: string;
    policyDecision: string;
    flags: string[];
  } {
    const flags: string[] = [];
    const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();
    const businessYears = payload.businessYears == null ? null : Number(payload.businessYears);

    if (normalizedKycStatus !== "verified") {
      flags.push("kyc_not_verified");
    }
    if (payload.guarantorCount <= 0) {
      flags.push("no_loan_guarantor");
    }
    if (payload.collateralCount <= 0) {
      flags.push("no_collateral");
    }
    if (payload.supportIncomeTotal <= 0) {
      flags.push("no_documented_support_income");
    }
    if (businessYears == null || businessYears < 1) {
      flags.push("limited_business_history");
    }
    if (payload.repaymentToSupportIncomeRatio != null && payload.repaymentToSupportIncomeRatio > 0.65) {
      flags.push("high_installment_burden");
    }
    if (payload.collateralCoverageRatio != null && payload.collateralCoverageRatio < 0.75) {
      flags.push("weak_collateral_coverage");
    }
    if (payload.guaranteeCoverageRatio != null && payload.guaranteeCoverageRatio < 0.25) {
      flags.push("weak_guarantee_coverage");
    }

    let policyDecision = "approved";
    if (
      normalizedKycStatus !== "verified"
      || (payload.repaymentToSupportIncomeRatio != null && payload.repaymentToSupportIncomeRatio > 0.95)
      || ((payload.collateralCoverageRatio ?? 0) < 0.25 && (payload.guaranteeCoverageRatio ?? 0) < 0.15)
    ) {
      policyDecision = "manual_review";
    }

    const kyc = {
      verified: normalizedKycStatus === "verified",
      businessYears: businessYears ?? 0,
    };

    const ratios = {
      supportIncomeTotal: payload.supportIncomeTotal,
      repaymentToSupportIncomeRatio: payload.repaymentToSupportIncomeRatio,
      collateralCoverageRatio: payload.collateralCoverageRatio ?? 0,
      guaranteeCoverageRatio: payload.guaranteeCoverageRatio ?? 0,
    };

    if (
      kyc.verified
      && ratios.supportIncomeTotal > 0
      && (ratios.repaymentToSupportIncomeRatio === null || ratios.repaymentToSupportIncomeRatio <= 0.45)
      && ratios.collateralCoverageRatio >= 1.0
      && ratios.guaranteeCoverageRatio >= 0.5
      && kyc.businessYears >= 2
    ) {
      policyDecision = "approved";
    }

    const severity = flags.length
      + ((payload.repaymentToSupportIncomeRatio ?? 0) > 0.75 ? 2 : 0)
      + ((payload.collateralCoverageRatio ?? 1) < 0.5 ? 2 : 0);

    let riskBand = "medium";
    if (severity <= 1 && policyDecision === "approved") {
      riskBand = "low";
    } else if (severity >= 5 || policyDecision === "manual_review") {
      riskBand = "high";
    }

    return {
      riskBand,
      policyDecision,
      flags,
    };
  }

  async function calculateLoanAssessment(loanId: number): Promise<LoanUnderwritingAssessment | null> {
    const loan = await get(
      `
        SELECT
          l.id,
          l.client_id,
          l.branch_id,
          l.principal,
          l.expected_total,
          l.balance,
          l.term_weeks,
          c.kyc_status,
          c.business_years
        FROM loans l
        INNER JOIN clients c ON c.id = l.client_id
        WHERE l.id = ?
        LIMIT 1
      `,
      [loanId],
    );

    if (!loan) {
      return null;
    }

    const [guarantorSummary, collateralSummary, existingAssessment] = await Promise.all([
      get(
        `
          SELECT
            COUNT(*) AS guarantor_count,
            COALESCE(SUM(COALESCE(g.monthly_income, 0)), 0) AS support_income_total,
            COALESCE(SUM(COALESCE(lg.guarantee_amount, 0)), 0) AS guarantee_amount_total
          FROM loan_guarantors lg
          INNER JOIN guarantors g ON g.id = lg.guarantor_id
          WHERE lg.loan_id = ?
        `,
        [loanId],
      ),
      get(
        `
          SELECT
            COUNT(*) AS collateral_count,
            COALESCE(
              SUM(
                CASE
                  WHEN lc.forced_sale_value IS NOT NULL AND lc.forced_sale_value > 0 THEN lc.forced_sale_value
                  WHEN ca.estimated_value IS NOT NULL AND ca.estimated_value > 0 THEN ROUND(ca.estimated_value * 0.7, 2)
                  ELSE 0
                END
              ),
              0
            ) AS collateral_value_total
          FROM loan_collaterals lc
          INNER JOIN collateral_assets ca ON ca.id = lc.collateral_asset_id
          WHERE lc.loan_id = ?
        `,
        [loanId],
      ),
      get(
        `
          SELECT override_decision, override_reason, assessed_at
          FROM loan_underwriting_assessments
          WHERE loan_id = ?
          LIMIT 1
        `,
        [loanId],
      ),
    ]);

    const principal = toMoney(loan.principal);
    const expectedTotal = toMoney(loan.expected_total);
    const balance = toMoney(loan.balance);
    const termWeeks = Math.max(1, Number(loan.term_weeks || 0) || 1);
    const guarantorCount = Number(guarantorSummary?.guarantor_count || 0);
    const collateralCount = Number(collateralSummary?.collateral_count || 0);
    const supportIncomeTotal = toMoney(guarantorSummary?.support_income_total);
    const guaranteeAmountTotal = toMoney(guarantorSummary?.guarantee_amount_total);
    const collateralValueTotal = toMoney(collateralSummary?.collateral_value_total);
    const estimatedWeeklyInstallment = toMoney(expectedTotal / termWeeks);
    const estimatedMonthlyInstallment = toMoney(estimatedWeeklyInstallment * 4.345);
    const repaymentToSupportIncomeRatio = toRatio(estimatedMonthlyInstallment, supportIncomeTotal);
    const collateralCoverageRatio = toRatio(collateralValueTotal, principal);
    const guaranteeCoverageRatio = toRatio(guaranteeAmountTotal, principal);
    const kycStatus = String(loan.kyc_status || "pending").trim().toLowerCase();
    const businessYears = loan.business_years == null ? null : Number(loan.business_years);
    const policy = derivePolicy({
      kycStatus,
      businessYears,
      guarantorCount,
      collateralCount,
      supportIncomeTotal,
      repaymentToSupportIncomeRatio,
      collateralCoverageRatio,
      guaranteeCoverageRatio,
    });
    const assessedAt = String(existingAssessment?.assessed_at || new Date().toISOString());
    const updatedAt = new Date().toISOString();

    return {
      loan_id: Number(loan.id),
      client_id: Number(loan.client_id),
      branch_id: loan.branch_id == null ? null : Number(loan.branch_id),
      principal,
      expected_total: expectedTotal,
      balance,
      term_weeks: termWeeks,
      guarantor_count: guarantorCount,
      collateral_count: collateralCount,
      support_income_total: supportIncomeTotal,
      estimated_weekly_installment: estimatedWeeklyInstallment,
      estimated_monthly_installment: estimatedMonthlyInstallment,
      repayment_to_support_income_ratio: repaymentToSupportIncomeRatio,
      collateral_value_total: collateralValueTotal,
      collateral_coverage_ratio: collateralCoverageRatio,
      guarantee_amount_total: guaranteeAmountTotal,
      guarantee_coverage_ratio: guaranteeCoverageRatio,
      business_years: businessYears,
      kyc_status: kycStatus,
      risk_band: policy.riskBand,
      policy_decision: policy.policyDecision,
      policy_flags: policy.flags,
      override_decision: existingAssessment?.override_decision || null,
      override_reason: existingAssessment?.override_reason || null,
      assessed_at: assessedAt,
      updated_at: updatedAt,
    };
  }

  async function refreshLoanAssessment(loanId: number): Promise<LoanUnderwritingAssessment | null> {
    const assessment = await calculateLoanAssessment(loanId);
    if (!assessment) {
      return null;
    }

    const existing = await get(
      "SELECT loan_id FROM loan_underwriting_assessments WHERE loan_id = ? LIMIT 1",
      [loanId],
    );

    const assessmentJson = JSON.stringify({
      ratios: {
        repayment_to_support_income_ratio: assessment.repayment_to_support_income_ratio,
        collateral_coverage_ratio: assessment.collateral_coverage_ratio,
        guarantee_coverage_ratio: assessment.guarantee_coverage_ratio,
      },
      installments: {
        estimated_weekly_installment: assessment.estimated_weekly_installment,
        estimated_monthly_installment: assessment.estimated_monthly_installment,
      },
      policy_flags: assessment.policy_flags,
    });
    const flagsJson = JSON.stringify(assessment.policy_flags);

    if (existing) {
      await run(
        `
          UPDATE loan_underwriting_assessments
          SET
            client_id = ?,
            branch_id = ?,
            principal = ?,
            expected_total = ?,
            balance = ?,
            term_weeks = ?,
            guarantor_count = ?,
            collateral_count = ?,
            support_income_total = ?,
            estimated_weekly_installment = ?,
            estimated_monthly_installment = ?,
            repayment_to_support_income_ratio = ?,
            collateral_value_total = ?,
            collateral_coverage_ratio = ?,
            guarantee_amount_total = ?,
            guarantee_coverage_ratio = ?,
            business_years = ?,
            kyc_status = ?,
            risk_band = ?,
            policy_decision = ?,
            flags_json = ?,
            assessment_json = ?,
            updated_at = ?
          WHERE loan_id = ?
        `,
        [
          assessment.client_id,
          assessment.branch_id,
          assessment.principal,
          assessment.expected_total,
          assessment.balance,
          assessment.term_weeks,
          assessment.guarantor_count,
          assessment.collateral_count,
          assessment.support_income_total,
          assessment.estimated_weekly_installment,
          assessment.estimated_monthly_installment,
          assessment.repayment_to_support_income_ratio,
          assessment.collateral_value_total,
          assessment.collateral_coverage_ratio,
          assessment.guarantee_amount_total,
          assessment.guarantee_coverage_ratio,
          assessment.business_years,
          assessment.kyc_status,
          assessment.risk_band,
          assessment.policy_decision,
          flagsJson,
          assessmentJson,
          assessment.updated_at,
          loanId,
        ],
      );
    } else {
      await run(
        `
          INSERT INTO loan_underwriting_assessments (
            loan_id,
            client_id,
            branch_id,
            principal,
            expected_total,
            balance,
            term_weeks,
            guarantor_count,
            collateral_count,
            support_income_total,
            estimated_weekly_installment,
            estimated_monthly_installment,
            repayment_to_support_income_ratio,
            collateral_value_total,
            collateral_coverage_ratio,
            guarantee_amount_total,
            guarantee_coverage_ratio,
            business_years,
            kyc_status,
            risk_band,
            policy_decision,
            flags_json,
            assessment_json,
            assessed_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          assessment.loan_id,
          assessment.client_id,
          assessment.branch_id,
          assessment.principal,
          assessment.expected_total,
          assessment.balance,
          assessment.term_weeks,
          assessment.guarantor_count,
          assessment.collateral_count,
          assessment.support_income_total,
          assessment.estimated_weekly_installment,
          assessment.estimated_monthly_installment,
          assessment.repayment_to_support_income_ratio,
          assessment.collateral_value_total,
          assessment.collateral_coverage_ratio,
          assessment.guarantee_amount_total,
          assessment.guarantee_coverage_ratio,
          assessment.business_years,
          assessment.kyc_status,
          assessment.risk_band,
          assessment.policy_decision,
          flagsJson,
          assessmentJson,
          assessment.assessed_at,
          assessment.updated_at,
        ],
      );
    }

    return assessment;
  }

  async function getLoanAssessment(loanId: number): Promise<LoanUnderwritingAssessment | null> {
    const row = await get(
      `
        SELECT
          loan_id,
          client_id,
          branch_id,
          principal,
          expected_total,
          balance,
          term_weeks,
          guarantor_count,
          collateral_count,
          support_income_total,
          estimated_weekly_installment,
          estimated_monthly_installment,
          repayment_to_support_income_ratio,
          collateral_value_total,
          collateral_coverage_ratio,
          guarantee_amount_total,
          guarantee_coverage_ratio,
          business_years,
          kyc_status,
          risk_band,
          policy_decision,
          flags_json,
          override_decision,
          override_reason,
          assessed_at,
          updated_at
        FROM loan_underwriting_assessments
        WHERE loan_id = ?
        LIMIT 1
      `,
      [loanId],
    );

    if (!row) {
      return null;
    }

    const flagsRaw = String(row.flags_json || "[]").trim();
    let policyFlags: string[] = [];
    try {
      const parsedFlags = JSON.parse(flagsRaw);
      if (Array.isArray(parsedFlags)) {
        policyFlags = parsedFlags.map((value) => String(value));
      }
    } catch {
      policyFlags = [];
    }

    return {
      loan_id: Number(row.loan_id),
      client_id: Number(row.client_id),
      branch_id: row.branch_id == null ? null : Number(row.branch_id),
      principal: toMoney(row.principal),
      expected_total: toMoney(row.expected_total),
      balance: toMoney(row.balance),
      term_weeks: Number(row.term_weeks || 0),
      guarantor_count: Number(row.guarantor_count || 0),
      collateral_count: Number(row.collateral_count || 0),
      support_income_total: toMoney(row.support_income_total),
      estimated_weekly_installment: toMoney(row.estimated_weekly_installment),
      estimated_monthly_installment: toMoney(row.estimated_monthly_installment),
      repayment_to_support_income_ratio: row.repayment_to_support_income_ratio == null ? null : Number(row.repayment_to_support_income_ratio),
      collateral_value_total: toMoney(row.collateral_value_total),
      collateral_coverage_ratio: row.collateral_coverage_ratio == null ? null : Number(row.collateral_coverage_ratio),
      guarantee_amount_total: toMoney(row.guarantee_amount_total),
      guarantee_coverage_ratio: row.guarantee_coverage_ratio == null ? null : Number(row.guarantee_coverage_ratio),
      business_years: row.business_years == null ? null : Number(row.business_years),
      kyc_status: String(row.kyc_status || "pending").trim().toLowerCase(),
      risk_band: String(row.risk_band || "medium").trim().toLowerCase(),
      policy_decision: String(row.policy_decision || "manual_review").trim().toLowerCase(),
      policy_flags: policyFlags,
      override_decision: row.override_decision || null,
      override_reason: row.override_reason || null,
      assessed_at: String(row.assessed_at || ""),
      updated_at: String(row.updated_at || ""),
    };
  }

  return {
    refreshLoanAssessment,
    getLoanAssessment,
  };
}

export {
  createLoanUnderwritingService,
};
