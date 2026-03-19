type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

type ClientOnboardingSnapshot = {
  client_id: number;
  onboarding_status: string;
  fee_payment_status: string;
  fees_paid_at: string | null;
  kyc_status: string;
  guarantor_count: number;
  collateral_count: number;
  ready_for_loan_application: boolean;
  blockers: string[];
  next_step: string | null;
};

type LoanWorkflowSnapshot = {
  loan_id: number;
  client_id: number;
  branch_id: number | null;
  loan_status: string;
  lifecycle_stage: string;
  lifecycle_stage_label: string;
  funding_stage: string;
  funding_stage_label: string;
  servicing_stage: string;
  servicing_stage_label: string;
  recovery_stage: string;
  recovery_stage_label: string;
  archive_state: string;
  archive_state_label: string;
  disbursed_at: string | null;
  maturity_date: string | null;
  current_dpd: number;
  par_bucket: string;
  balance: number;
  guarantor_count: number;
  collateral_count: number;
  installment_summary: {
    total_installments: number;
    pending_installments: number;
    overdue_installments: number;
    paid_installments: number;
    pending_amount: number;
    overdue_amount: number;
    next_due_date: string | null;
  };
  client_onboarding: ClientOnboardingSnapshot;
  approval_blockers: string[];
  can_approve: boolean;
  can_disburse: boolean;
  can_record_repayment: boolean;
  can_request_top_up: boolean;
  can_request_refinance: boolean;
  can_extend_term: boolean;
};

function formatLifecycleLabel(value: string): string {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function deriveClientOnboardingStatus(payload: {
  kycStatus: string;
  guarantorCount: number;
  collateralCount: number;
  feesPaid: boolean;
}): string {
  const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();

  if (normalizedKycStatus === "verified" && payload.guarantorCount > 0 && payload.collateralCount > 0 && payload.feesPaid) {
    return "complete";
  }
  if (normalizedKycStatus === "verified") {
    return "kyc_verified";
  }
  if (["in_review", "rejected", "suspended"].includes(normalizedKycStatus)) {
    return "kyc_pending";
  }
  return "registered";
}

function buildClientOnboardingBlockers(payload: {
  kycStatus: string;
  guarantorCount: number;
  collateralCount: number;
  feesPaid: boolean;
}): string[] {
  const blockers: string[] = [];
  if (String(payload.kycStatus || "pending").trim().toLowerCase() !== "verified") {
    blockers.push("Verify client KYC");
  }
  if (payload.guarantorCount <= 0) {
    blockers.push("Add at least one client guarantor");
  }
  if (payload.collateralCount <= 0) {
    blockers.push("Add at least one client collateral asset");
  }
  if (!payload.feesPaid) {
    blockers.push("Record client onboarding fee payment");
  }
  return blockers;
}

function appendUniqueBlocker(blockers: string[], blocker: string): void {
  const normalizedBlocker = String(blocker || "").trim();
  if (!normalizedBlocker || blockers.includes(normalizedBlocker)) {
    return;
  }

  blockers.push(normalizedBlocker);
}

function buildLoanApprovalBlockers(payload: {
  clientOnboarding: ClientOnboardingSnapshot;
  guarantorCount: number;
  collateralCount: number;
}): string[] {
  const blockers: string[] = [];
  for (const blocker of payload.clientOnboarding.blockers) {
    appendUniqueBlocker(blockers, blocker);
  }

  if (payload.clientOnboarding.guarantor_count > 0 && payload.guarantorCount <= 0) {
    appendUniqueBlocker(blockers, "Link at least one guarantor to the loan");
  }
  if (payload.clientOnboarding.collateral_count > 0 && payload.collateralCount <= 0) {
    appendUniqueBlocker(blockers, "Link at least one collateral asset to the loan");
  }

  return blockers;
}

function deriveLoanLifecycleStage(payload: {
  loanStatus: string;
  totalInstallments: number;
  pendingInstallments: number;
  overdueInstallments: number;
  fundingStage?: string;
  servicingStage?: string;
  archiveState?: string;
}): string {
  const normalizedStatus = String(payload.loanStatus || "").trim().toLowerCase();
  const normalizedFundingStage = String(payload.fundingStage || "").trim().toLowerCase();
  const normalizedServicingStage = String(payload.servicingStage || "").trim().toLowerCase();
  const normalizedArchiveState = String(payload.archiveState || "").trim().toLowerCase();

  if (normalizedArchiveState === "archived") {
    return "archived";
  }

  if (normalizedStatus === "pending_approval") {
    return "loan_application";
  }
  if (normalizedStatus === "approved") {
    if (normalizedFundingStage === "partially_disbursed") {
      return "approved_partial_disbursement";
    }
    return "approved_waiting_disbursement";
  }
  if (normalizedStatus === "rejected") {
    return "rejected";
  }
  if (normalizedStatus === "written_off") {
    return "written_off";
  }
  if (normalizedStatus === "closed") {
    return "closed";
  }
  if (normalizedStatus === "active" || normalizedStatus === "restructured") {
    if (normalizedServicingStage === "matured_unpaid") {
      return "matured_unpaid";
    }
    if (payload.overdueInstallments > 0) {
      return "arrears";
    }
    if (payload.pendingInstallments > 0 || payload.totalInstallments > 0) {
      return "waiting_for_dues";
    }
  }

  return normalizedStatus || "unknown";
}

function toStartOfDayUtc(value: string): number | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function deriveCurrentDpd(payload: {
  oldestOverdueDate: string | null;
  overdueInstallments: number;
}): number {
  if (!payload.oldestOverdueDate || payload.overdueInstallments <= 0) {
    return 0;
  }

  const overdueDayMs = toStartOfDayUtc(payload.oldestOverdueDate);
  if (overdueDayMs == null) {
    return 0;
  }

  const todayDayMs = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const diffDays = Math.floor((todayDayMs - overdueDayMs) / (24 * 60 * 60 * 1000));
  return Math.max(0, diffDays);
}

function deriveParBucket(currentDpd: number): string {
  if (currentDpd >= 90) {
    return "par_90_plus";
  }
  if (currentDpd >= 60) {
    return "par_60";
  }
  if (currentDpd >= 30) {
    return "par_30";
  }
  if (currentDpd > 0) {
    return "par_1_29";
  }
  return "current";
}

function deriveFundingStage(payload: {
  loanStatus: string;
  disbursementTrancheCount: number;
  archivedAt: string | null;
}): string {
  if (payload.archivedAt) {
    return "archived";
  }

  const normalizedStatus = String(payload.loanStatus || "").trim().toLowerCase();
  if (normalizedStatus === "approved") {
    return payload.disbursementTrancheCount > 0 ? "partially_disbursed" : "pending_disbursement";
  }
  if (["active", "restructured", "closed", "written_off"].includes(normalizedStatus)) {
    return "fully_disbursed";
  }
  return "not_ready";
}

function deriveServicingStage(payload: {
  loanStatus: string;
  currentDpd: number;
  balance: number;
  maturityDate: string | null;
}): string {
  const normalizedStatus = String(payload.loanStatus || "").trim().toLowerCase();
  if (["pending_approval", "approved", "rejected"].includes(normalizedStatus)) {
    return "pre_service";
  }
  if (normalizedStatus === "written_off") {
    return "written_off";
  }
  if (normalizedStatus === "closed") {
    return "settled";
  }

  const maturityTime = payload.maturityDate ? new Date(payload.maturityDate).getTime() : Number.NaN;
  if (payload.balance > 0 && Number.isFinite(maturityTime) && maturityTime < Date.now()) {
    return "matured_unpaid";
  }
  if (payload.currentDpd >= 90) {
    return "par_90_plus";
  }
  if (payload.currentDpd >= 60) {
    return "par_60";
  }
  if (payload.currentDpd >= 30) {
    return "par_30";
  }
  if (payload.currentDpd > 0) {
    return "overdue";
  }
  return "current";
}

function deriveRecoveryStage(payload: {
  loanStatus: string;
  currentDpd: number;
}): string {
  const normalizedStatus = String(payload.loanStatus || "").trim().toLowerCase();
  if (normalizedStatus === "written_off") {
    return "written_off";
  }
  if (normalizedStatus === "restructured") {
    return "restructured";
  }
  if (payload.currentDpd >= 30) {
    return "collections";
  }
  return "standard";
}

function deriveArchiveState(archivedAt: string | null): string {
  return archivedAt ? "archived" : "active_record";
}

async function getClientOnboardingSnapshot({
  get,
  clientId,
}: {
  get: DbGet;
  clientId: number;
}): Promise<ClientOnboardingSnapshot | null> {
  const client = await get(
    `
      SELECT
        id,
        onboarding_status,
        fee_payment_status,
        fees_paid_at,
        kyc_status
      FROM clients
      WHERE id = ?
      LIMIT 1
    `,
    [clientId],
  );

  if (!client) {
    return null;
  }

  const [guarantorCountRow, collateralCountRow] = await Promise.all([
    get(
      `
        SELECT COUNT(*) AS total
        FROM guarantors
        WHERE client_id = ?
          AND COALESCE(is_active, 1) = 1
      `,
      [clientId],
    ),
    get(
      `
        SELECT COUNT(*) AS total
        FROM collateral_assets
        WHERE client_id = ?
          AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')
      `,
      [clientId],
    ),
  ]);

  const guarantorCount = Number(guarantorCountRow?.total || 0);
  const collateralCount = Number(collateralCountRow?.total || 0);
  const feePaymentStatus = String(client.fee_payment_status || "unpaid").trim().toLowerCase();
  const feesPaid = feePaymentStatus === "paid";
  const blockers = buildClientOnboardingBlockers({
    kycStatus: String(client.kyc_status || "pending"),
    guarantorCount,
    collateralCount,
    feesPaid,
  });
  const derivedStatus = deriveClientOnboardingStatus({
    kycStatus: String(client.kyc_status || "pending"),
    guarantorCount,
    collateralCount,
    feesPaid,
  });

  let nextStep: string | null = null;
  const normalizedKycStatus = String(client.kyc_status || "pending").trim().toLowerCase();
  if (normalizedKycStatus !== "verified") {
    nextStep = normalizedKycStatus === "in_review"
      ? "complete_kyc_review"
      : normalizedKycStatus === "rejected"
        ? "resubmit_kyc"
        : normalizedKycStatus === "suspended"
          ? "resolve_kyc_hold"
          : "start_kyc";
  } else if (guarantorCount <= 0) {
    nextStep = "add_guarantor";
  } else if (collateralCount <= 0) {
    nextStep = "add_collateral";
  } else if (!feesPaid) {
    nextStep = "record_fee_payment";
  }

  return {
    client_id: Number(client.id),
    onboarding_status: derivedStatus || String(client.onboarding_status || "registered").trim().toLowerCase(),
    fee_payment_status: feePaymentStatus,
    fees_paid_at: client.fees_paid_at || null,
    kyc_status: String(client.kyc_status || "pending").trim().toLowerCase(),
    guarantor_count: guarantorCount,
    collateral_count: collateralCount,
    ready_for_loan_application: blockers.length === 0,
    blockers,
    next_step: nextStep,
  };
}

async function getLoanWorkflowSnapshot({
  get,
  loanId,
}: {
  get: DbGet;
  loanId: number;
}): Promise<LoanWorkflowSnapshot | null> {
  const loan = await get(
    `
      SELECT
        l.id,
        l.client_id,
        l.branch_id,
        l.status,
        l.disbursed_at,
        l.balance,
        l.created_at,
        l.archived_at,
        l.principal
      FROM loans l
      WHERE l.id = ?
      LIMIT 1
    `,
    [loanId],
  );

  if (!loan) {
    return null;
  }

  const [clientOnboarding, loanGuarantorCountRow, loanCollateralCountRow, installmentSummaryRow, disbursementSummaryRow] = await Promise.all([
    getClientOnboardingSnapshot({ get, clientId: Number(loan.client_id) }),
    get(
      `
        SELECT COUNT(*) AS total
        FROM loan_guarantors
        WHERE loan_id = ?
      `,
      [loanId],
    ),
    get(
      `
        SELECT COUNT(*) AS total
        FROM loan_collaterals
        WHERE loan_id = ?
      `,
      [loanId],
    ),
    get(
      `
        SELECT
          COUNT(*) AS total_installments,
          SUM(
            CASE
              WHEN status = 'paid' THEN 0
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
              WHEN datetime(due_date) < datetime('now') OR status = 'overdue' THEN 0
              ELSE 1
            END
          ) AS pending_installments,
          SUM(
            CASE
              WHEN status = 'paid' THEN 0
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
              WHEN datetime(due_date) < datetime('now') OR status = 'overdue' THEN 1
              ELSE 0
            END
          ) AS overdue_installments,
          SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_installments,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'paid' THEN 0
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                WHEN datetime(due_date) < datetime('now') OR status = 'overdue' THEN 0
                ELSE amount_due - amount_paid
              END
            ),
            0
          ) AS pending_amount,
          COALESCE(
            SUM(
              CASE
                WHEN status = 'paid' THEN 0
                WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN 0
                WHEN datetime(due_date) < datetime('now') OR status = 'overdue' THEN amount_due - amount_paid
                ELSE 0
              END
            ),
            0
          ) AS overdue_amount,
          MIN(
            CASE
              WHEN status = 'paid' THEN NULL
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN NULL
              WHEN datetime(due_date) < datetime('now') OR status = 'overdue' THEN due_date
              ELSE NULL
            END
          ) AS oldest_overdue_date,
          MIN(
            CASE
              WHEN status = 'paid' THEN NULL
              WHEN COALESCE(amount_due, 0) - COALESCE(amount_paid, 0) <= 0 THEN NULL
              ELSE due_date
            END
          ) AS next_due_date,
          MAX(due_date) AS maturity_date
        FROM loan_installments
        WHERE loan_id = ?
      `,
      [loanId],
    ),
    get(
      `
        SELECT
          COUNT(*) AS tranche_count,
          COALESCE(SUM(amount), 0) AS total_disbursed
        FROM loan_disbursement_tranches
        WHERE loan_id = ?
      `,
      [loanId],
    ),
  ]);

  if (!clientOnboarding) {
    return null;
  }

  const guarantorCount = Number(loanGuarantorCountRow?.total || 0);
  const collateralCount = Number(loanCollateralCountRow?.total || 0);
  const totalInstallments = Number(installmentSummaryRow?.total_installments || 0);
  const pendingInstallments = Number(installmentSummaryRow?.pending_installments || 0);
  const overdueInstallments = Number(installmentSummaryRow?.overdue_installments || 0);
  const paidInstallments = Number(installmentSummaryRow?.paid_installments || 0);
  const pendingAmount = Number(installmentSummaryRow?.pending_amount || 0);
  const overdueAmount = Number(installmentSummaryRow?.overdue_amount || 0);
  const currentDpd = deriveCurrentDpd({
    oldestOverdueDate: installmentSummaryRow?.oldest_overdue_date || null,
    overdueInstallments,
  });
  const fundingStage = deriveFundingStage({
    loanStatus: String(loan.status || ""),
    disbursementTrancheCount: Number(disbursementSummaryRow?.tranche_count || 0),
    archivedAt: loan.archived_at || null,
  });
  const servicingStage = deriveServicingStage({
    loanStatus: String(loan.status || ""),
    currentDpd,
    balance: Number(loan.balance || 0),
    maturityDate: installmentSummaryRow?.maturity_date || null,
  });
  const recoveryStage = deriveRecoveryStage({
    loanStatus: String(loan.status || ""),
    currentDpd,
  });
  const archiveState = deriveArchiveState(loan.archived_at || null);
  const parBucket = deriveParBucket(currentDpd);
  const lifecycleStage = deriveLoanLifecycleStage({
    loanStatus: String(loan.status || ""),
    totalInstallments,
    pendingInstallments,
    overdueInstallments,
    fundingStage,
    servicingStage,
    archiveState,
  });

  const approvalBlockers = buildLoanApprovalBlockers({
    clientOnboarding,
    guarantorCount,
    collateralCount,
  });

  const normalizedLoanStatus = String(loan.status || "").trim().toLowerCase();

  return {
    loan_id: Number(loan.id),
    client_id: Number(loan.client_id),
    branch_id: loan.branch_id == null ? null : Number(loan.branch_id),
    loan_status: normalizedLoanStatus,
    lifecycle_stage: lifecycleStage,
    lifecycle_stage_label: formatLifecycleLabel(lifecycleStage),
    funding_stage: fundingStage,
    funding_stage_label: formatLifecycleLabel(fundingStage),
    servicing_stage: servicingStage,
    servicing_stage_label: formatLifecycleLabel(servicingStage),
    recovery_stage: recoveryStage,
    recovery_stage_label: formatLifecycleLabel(recoveryStage),
    archive_state: archiveState,
    archive_state_label: formatLifecycleLabel(archiveState),
    disbursed_at: loan.disbursed_at || null,
    maturity_date: installmentSummaryRow?.maturity_date || null,
    current_dpd: currentDpd,
    par_bucket: parBucket,
    balance: Number(loan.balance || 0),
    guarantor_count: guarantorCount,
    collateral_count: collateralCount,
    installment_summary: {
      total_installments: totalInstallments,
      pending_installments: pendingInstallments,
      overdue_installments: overdueInstallments,
      paid_installments: paidInstallments,
      pending_amount: pendingAmount,
      overdue_amount: overdueAmount,
      next_due_date: installmentSummaryRow?.next_due_date || null,
    },
    client_onboarding: clientOnboarding,
    approval_blockers: approvalBlockers,
    can_approve: normalizedLoanStatus === "pending_approval" && approvalBlockers.length === 0,
    can_disburse: normalizedLoanStatus === "approved",
    can_record_repayment: normalizedLoanStatus === "active" || normalizedLoanStatus === "restructured",
    can_request_top_up: normalizedLoanStatus === "active" || normalizedLoanStatus === "restructured",
    can_request_refinance: normalizedLoanStatus === "active" || normalizedLoanStatus === "restructured",
    can_extend_term: normalizedLoanStatus === "active" || normalizedLoanStatus === "restructured",
  };
}

export {
  getClientOnboardingSnapshot,
  getLoanWorkflowSnapshot,
  deriveLoanLifecycleStage,
  formatLifecycleLabel,
};

