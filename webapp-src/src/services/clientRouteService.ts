import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../utils/http.js";
import { buildTabularExport } from "./reportExportService.js";
import type { ClientRouteDeps } from "../types/routeDeps.js";
import { createClientReadRepository } from "../repositories/clientReadRepository.js";
import { createLoanUnderwritingService } from "./loanUnderwritingService.js";

type UserLike = Record<string, any>;
type QueryLike = Record<string, any>;
type DbRow = Record<string, any>;
type DbGetLike = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAllLike = (sql: string, params?: unknown[]) => Promise<DbRow[]>;

/**
 * Computes the next graduated loan limit for a client based on repayment history and frequency.
 * Graduation rules:
 * - 1st loan: can graduate to 3k if very good repayment, 2k if repayment is good
 * - Subsequent loans: typically 2k, higher only for exceptional repayment
 * - Uses payment frequency and set terms to assess
 * Returns the next graduated limit (number, in thousands)
 */
async function computeGraduatedLimitForClient(
  clientId: number,
  user: UserLike,
  get: DbGetLike,
  all: DbAllLike,
): Promise<number> {
  // Fetch all loans for the client
  const loans = await all(
    `SELECT id, status, principal, expected_total, repaid_total, disbursed_at, closed_at FROM loans WHERE client_id = ? ORDER BY disbursed_at ASC, id ASC`,
    [clientId],
  );
  if (!loans || loans.length === 0) return 0;

  // Only consider closed loans for graduation
  const closedLoans = loans.filter((l: any) => String(l.status) === "closed");
  if (closedLoans.length === 0) return 0;

  // Get repayment history for the most recent closed loan
  const lastLoan = closedLoans[closedLoans.length - 1];
  const repayments = await all(
    `SELECT amount, paid_at FROM repayments WHERE loan_id = ? ORDER BY paid_at ASC`,
    [lastLoan.id]
  );

  // Calculate repayment stats
  const totalRepaid = repayments.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
  const expectedTotal = Number(lastLoan.expected_total || 0);
  const principal = Number(lastLoan.principal || 0);
  const repaidRatio = expectedTotal > 0 ? totalRepaid / expectedTotal : 0;

  // Calculate repayment frequency (average days between payments)
  let avgDaysBetweenPayments = null;
  if (repayments.length > 1) {
    let totalDays = 0;
    for (let i = 1; i < repayments.length; ++i) {
      const prev = new Date(repayments[i - 1].paid_at);
      const curr = new Date(repayments[i].paid_at);
      totalDays += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    }
    avgDaysBetweenPayments = totalDays / (repayments.length - 1);
  }

  // Graduation logic
  if (closedLoans.length === 1) {
    // 1st loan graduation
    if (repaidRatio >= 0.98 && avgDaysBetweenPayments !== null && avgDaysBetweenPayments <= 8) {
      // Very good repayment: almost all paid, frequent payments (weekly or better)
      return 3000;
    } else if (repaidRatio >= 0.95) {
      // Good repayment, but not perfect
      return 2000;
    } else {
      // Otherwise, no graduation
      return principal;
    }
  } else {
    // Subsequent loans
    // Check last 2 closed loans for consistent good repayment
    const recentLoans = closedLoans.slice(-2);
    let allGood = true;
    for (const loan of recentLoans) {
      const reps = await all(
        `SELECT amount, paid_at FROM repayments WHERE loan_id = ? ORDER BY paid_at ASC`,
      [loan.id],
      );
      const totRep = reps.reduce((sum: number, r: any) => sum + Number(r.amount || 0), 0);
      const expTot = Number(loan.expected_total || 0);
      const repRatio = expTot > 0 ? totRep / expTot : 0;
      let avgDays = null;
      if (reps.length > 1) {
        let tDays = 0;
        for (let i = 1; i < reps.length; ++i) {
          const prev = new Date(reps[i - 1].paid_at);
          const curr = new Date(reps[i].paid_at);
          tDays += (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
        }
        avgDays = tDays / (reps.length - 1);
      }
      if (!(repRatio >= 0.97 && avgDays !== null && avgDays <= 8)) {
        allGood = false;
        break;
      }
    }
    if (allGood) {
      // Exceptional: allow 3k graduation
      return 3000;
    } else {
      // Typical graduation: 2k
      return 2000;
    }
  }
}

type PotentialDuplicateResult = Record<string, unknown> & {
  id?: number | string;
  matchScore: number;
  matchSignals: string[];
};

function normalizeExportFormat(value: unknown) {
  return String(value || "json").trim().toLowerCase();
}

function buildClientListExportFilename(isDormantOnly: boolean) {
  const stamp = new Date().toISOString().slice(0, 10);
  return isDormantOnly
    ? `dormant-borrowers-${stamp}`
    : `borrowers-${stamp}`;
}

function mapClientListExportRows(clients: Array<Record<string, any>>) {
  return clients.map((client) => ({
    BorrowerRef: `BRW-${String(client.id || "").padStart(6, "0")}`,
    FullName: String(client.full_name || ""),
    Phone: String(client.phone || ""),
    NationalId: String(client.national_id || ""),
    Branch: String(client.branch_name || ""),
    Agent: String(client.assigned_officer_name || ""),
    LoanCount: Number(client.loan_count || 0),
    CompletedLoans: Number(client.closed_loan_count || 0),
    OpenLoans: Number(client.open_loan_count || 0),
    KycStatus: String(client.kyc_status || ""),
    OnboardingStatus: String(client.onboarding_status || ""),
    FeePaymentStatus: String(client.fee_payment_status || ""),
    Active: Number(client.is_active || 0) === 1 ? "Yes" : "No",
    CreatedAt: String(client.created_at || ""),
    UpdatedAt: String(client.updated_at || ""),
  }));
}

function createClientRouteService(deps: ClientRouteDeps) {
  const {
    run,
    get,
    all,
    writeAuditLog,
    hierarchyService,
    reportCache = null,
  } = deps;
  const clientReadRepository = createClientReadRepository({ all, get });
  const loanUnderwritingService = createLoanUnderwritingService({ get, run });

  async function invalidateReportCaches() {
    if (!reportCache || !reportCache.enabled) {
      return;
    }
    try {
      await reportCache.invalidatePrefix("reports:");
    } catch (_error) {
      // Best-effort cache invalidation should not fail request writes.
    }
  }

  function hasOwn(payload: Record<string, unknown> | null | undefined, key: string) {
    return Object.prototype.hasOwnProperty.call(payload || {}, key);
  }

  function isLoanOfficer(user: Record<string, unknown> | null | undefined) {
    return String(user?.role || "").toLowerCase() === "loan_officer";
  }

  function canAccessClientByOwnership(user: Record<string, unknown> | null | undefined, client: Record<string, unknown> | null | undefined) {
    if (!isLoanOfficer(user)) {
      return true;
    }

    const userId = Number(user?.sub);
    if (!Number.isInteger(userId) || userId <= 0) {
      return false;
    }

    const officerId = client?.officer_id == null ? null : Number(client.officer_id);
    if (officerId != null && Number.isInteger(officerId) && officerId > 0) {
      return officerId === userId;
    }

    const createdByUserId = client?.created_by_user_id == null ? null : Number(client.created_by_user_id);
    if (createdByUserId != null && Number.isInteger(createdByUserId) && createdByUserId > 0) {
      return createdByUserId === userId;
    }

    return false;
  }

  function deriveOnboardingStatus(payload: {
    kycStatus: string;
    hasGuarantor: boolean;
    hasCollateral: boolean;
    feesPaid: boolean;
  }) {
    const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();

    if (normalizedKycStatus === "verified" && payload.hasGuarantor && payload.hasCollateral && payload.feesPaid) {
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

  function deriveOnboardingNextStep(payload: {
    kycStatus: string;
    hasGuarantor: boolean;
    hasCollateral: boolean;
    feesPaid: boolean;
  }) {
    const normalizedKycStatus = String(payload.kycStatus || "pending").trim().toLowerCase();

    if (normalizedKycStatus !== "verified") {
      if (normalizedKycStatus === "in_review") {
        return "complete_kyc_review";
      }
      if (normalizedKycStatus === "rejected") {
        return "resubmit_kyc";
      }
      if (normalizedKycStatus === "suspended") {
        return "resolve_kyc_hold";
      }
      return "start_kyc";
    }
    if (!payload.hasGuarantor) {
      return "add_guarantor";
    }
    if (!payload.hasCollateral) {
      return "add_collateral";
    }
    if (!payload.feesPaid) {
      return "record_fee_payment";
    }
    return null;
  }

  async function loadClientOnboardingProgress(clientId: number) {
    const [guarantorCountRow, collateralCountRow, clientRow] = await Promise.all([
      get("SELECT COUNT(*) AS total FROM guarantors WHERE client_id = ?", [clientId]),
      get("SELECT COUNT(*) AS total FROM collateral_assets WHERE client_id = ?", [clientId]),
      get(
        `
          SELECT
            id,
            kyc_status,
            onboarding_status,
            fee_payment_status,
            fees_paid_at
          FROM clients
          WHERE id = ?
        `,
        [clientId],
      ),
    ]);

    const guarantorCount = Number(guarantorCountRow?.total || 0);
    const collateralCount = Number(collateralCountRow?.total || 0);
    const feesPaid = String(clientRow?.fee_payment_status || "unpaid").toLowerCase() === "paid";
    const kycStatus = String(clientRow?.kyc_status || "pending").toLowerCase();
    const nextStatus = deriveOnboardingStatus({
      kycStatus,
      hasGuarantor: guarantorCount > 0,
      hasCollateral: collateralCount > 0,
      feesPaid,
    });
    const nextStep = deriveOnboardingNextStep({
      kycStatus,
      hasGuarantor: guarantorCount > 0,
      hasCollateral: collateralCount > 0,
      feesPaid,
    });

    return {
      guarantorCount,
      collateralCount,
      feesPaid,
      kycStatus,
      feePaymentStatus: String(clientRow?.fee_payment_status || "unpaid").toLowerCase(),
      feesPaidAt: clientRow?.fees_paid_at || null,
      currentOnboardingStatus: String(clientRow?.onboarding_status || "registered").toLowerCase(),
      nextStatus,
      nextStep,
    };
  }

  async function syncClientOnboardingStatus(clientId: number) {
    const progress = await loadClientOnboardingProgress(clientId);
    if (progress.currentOnboardingStatus !== progress.nextStatus) {
      const updatedAt = new Date().toISOString();
      await run(
        `
          UPDATE clients
          SET onboarding_status = ?, updated_at = ?
          WHERE id = ?
        `,
        [progress.nextStatus, updatedAt, clientId],
      );
    }
    return progress;
  }

  function normalizeName(value: unknown) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
  }

  function normalizeNationalId(value: unknown) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "");
  }

  function normalizePhone(value: unknown) {
    return String(value || "").replace(/\D+/g, "");
  }

  function tokenizeName(value: string) {
    return value
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length >= 2);
  }

  function scorePotentialDuplicate(query: { nationalId?: string; phone?: string; name?: string }, client: Record<string, unknown>) {
    const queryNationalId = normalizeNationalId(query.nationalId);
    const queryPhone = normalizePhone(query.phone);
    const queryName = normalizeName(query.name);

    const clientNationalId = normalizeNationalId(client.national_id);
    const clientPhone = normalizePhone(client.phone);
    const clientName = normalizeName(client.full_name);

    const signals: string[] = [];
    let score = 0;

    if (queryNationalId && clientNationalId) {
      if (clientNationalId === queryNationalId) {
        score += 90;
        signals.push("exact_national_id");
      } else if (clientNationalId.includes(queryNationalId) || queryNationalId.includes(clientNationalId)) {
        score += 60;
        signals.push("partial_national_id");
      }
    }

    if (queryPhone && clientPhone) {
      if (clientPhone === queryPhone) {
        score += 80;
        signals.push("exact_phone");
      } else if (clientPhone.includes(queryPhone) || queryPhone.includes(clientPhone)) {
        score += 45;
        signals.push("partial_phone");
      } else if (queryPhone.length >= 7 && clientPhone.length >= 7 && clientPhone.slice(-7) === queryPhone.slice(-7)) {
        score += 50;
        signals.push("same_phone_suffix");
      }
    }

    if (queryName && clientName) {
      if (clientName === queryName) {
        score += 70;
        signals.push("exact_name");
      } else if (clientName.includes(queryName) || queryName.includes(clientName)) {
        score += 45;
        signals.push("partial_name");
      } else {
        const queryNameTokens = tokenizeName(queryName);
        const clientNameTokens = new Set(tokenizeName(clientName));
        const overlap = queryNameTokens.filter((token) => clientNameTokens.has(token)).length;
        if (overlap >= 2) {
          score += 35;
          signals.push("name_token_overlap");
        } else if (overlap === 1) {
          score += 20;
          signals.push("name_token_partial_overlap");
        }
      }
    }

    if (signals.includes("partial_name") && signals.includes("same_phone_suffix")) {
      score += 10;
      signals.push("name_phone_combined_signal");
    }

    return {
      score,
      signals,
    };
  }

  async function hasDuplicateNationalId(nationalId: unknown, excludeClientId: number | null = null) {
    if (!nationalId) {
      return false;
    }

    const normalizedNationalId = String(nationalId).trim().toLowerCase();
    const existing = await get(
      `
        SELECT id
        FROM clients
        WHERE national_id IS NOT NULL
          AND LOWER(TRIM(national_id)) = ?
          ${excludeClientId ? "AND id != ?" : ""}
      `,
      excludeClientId ? [normalizedNationalId, excludeClientId] : [normalizedNationalId],
    );

    return Boolean(existing?.id);
  }

  async function refreshLoanAssessments(loanIds: number[]) {
    const normalizedLoanIds = [...new Set(
      loanIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    )];

    for (const loanId of normalizedLoanIds) {
      await loanUnderwritingService.refreshLoanAssessment(loanId);
    }
  }

  async function refreshLinkedLoanAssessmentsForGuarantor(guarantorId: number) {
    const linkedLoans = await all(
      `
        SELECT DISTINCT loan_id
        FROM loan_guarantors
        WHERE guarantor_id = ?
      `,
      [guarantorId],
    );

    await refreshLoanAssessments(linkedLoans.map((row) => Number(row.loan_id || 0)));
  }

  async function refreshLinkedLoanAssessmentsForCollateral(collateralAssetId: number) {
    const linkedLoans = await all(
      `
        SELECT DISTINCT loan_id
        FROM loan_collaterals
        WHERE collateral_asset_id = ?
      `,
      [collateralAssetId],
    );

    await refreshLoanAssessments(linkedLoans.map((row) => Number(row.loan_id || 0)));
  }

  async function resolveClientScopeClient(clientId: number, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await get("SELECT * FROM clients WHERE id = ?", [clientId]);

    if (!client) {
      return { status: 404 as const, body: { message: "Client not found" } };
    }

    if (!hierarchyService.isBranchInScope(scope, client.branch_id)) {
      return { status: 403 as const, body: { message: "Forbidden: client is outside your scope" } };
    }

    if (!canAccessClientByOwnership(user, client)) {
      return { status: 403 as const, body: { message: "Forbidden: client is outside your assignment" } };
    }

    return { status: 200 as const, scope, client };
  }

  async function createClient(payload: Record<string, any>, user: UserLike, ipAddress: string) {
    if (await hasDuplicateNationalId(payload.nationalId || null)) {
      return { status: 409, body: { message: "A client with this national ID already exists" } };
    }

    const scope = await hierarchyService.resolveHierarchyScope(user);
    let branchId = payload.branchId || null;

    if (scope.level === "branch") {
      if (branchId && Number(branchId) !== Number(scope.branchId)) {
        return { status: 403, body: { message: "Forbidden: branch assignment is outside your scope" } };
      }
      branchId = scope.branchId;
    }

    if (!branchId) {
      branchId = user.branchId || null;
    }

    if (!branchId) {
      const activeBranches = await hierarchyService.getBranches({ includeInactive: false });
      branchId = activeBranches[0]?.id || null;
    }

    if (!branchId) {
      return { status: 400, body: { message: "No active branches are configured. Create a branch first." } };
    }

    const branch = await hierarchyService.getBranchById(branchId, { requireActive: true });
    if (!branch) {
      return { status: 400, body: { message: "Selected branch was not found or is inactive" } };
    }

    const normalizedUserRole = String(user?.role || "").trim().toLowerCase();
    const payloadOfficerId = Number(payload.officerId || 0) || null;
    const hasPayloadOfficerId = payloadOfficerId !== null && Number.isInteger(payloadOfficerId) && payloadOfficerId > 0;
    const selectedOfficerId = hasPayloadOfficerId
      ? payloadOfficerId
      : (normalizedUserRole === "loan_officer" ? Number(user.sub) : null);

    if (normalizedUserRole === "loan_officer" && selectedOfficerId !== Number(user.sub)) {
      return { status: 403, body: { message: "Forbidden: loan officers cannot assign clients to another officer" } };
    }
    if (selectedOfficerId) {
      const selectedOfficer = await get(
        `
          SELECT id, role, is_active, branch_id
          FROM users
          WHERE id = ?
        `,
        [selectedOfficerId],
      );
      if (!selectedOfficer) {
        return { status: 400, body: { message: "Selected loan officer was not found" } };
      }
      if (String(selectedOfficer.role || "").trim().toLowerCase() !== "loan_officer") {
        return { status: 400, body: { message: "Selected user is not a loan officer" } };
      }
      if (Number(selectedOfficer.is_active || 0) !== 1) {
        return { status: 400, body: { message: "Selected loan officer is inactive" } };
      }
      if (!Number.isInteger(Number(selectedOfficer.branch_id)) || Number(selectedOfficer.branch_id) <= 0) {
        return { status: 400, body: { message: "Selected loan officer has no branch assignment" } };
      }
      if (Number(selectedOfficer.branch_id) !== Number(branchId)) {
        return { status: 400, body: { message: "Selected loan officer belongs to a different branch" } };
      }
    }

    const createdAt = new Date().toISOString();
    const insert = await run(
      `
        INSERT INTO clients (
          full_name, phone, national_id, branch_id, created_by_user_id,
          kra_pin, photo_url, id_document_url,
          next_of_kin_name, next_of_kin_phone, next_of_kin_relation,
          business_type, business_years, business_location, residential_address,
          officer_id, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.fullName,
        payload.phone || null,
        payload.nationalId || null,
        branchId,
        user.sub,
        payload.kraPin || null,
        payload.photoUrl || null,
        payload.idDocumentUrl || null,
        payload.nextOfKinName || null,
        payload.nextOfKinPhone || null,
        payload.nextOfKinRelation || null,
        payload.businessType || null,
        payload.businessYears || null,
        payload.businessLocation || null,
        payload.residentialAddress || null,
        selectedOfficerId,
        createdAt,
        createdAt,
      ],
    );

    const client = await get("SELECT * FROM clients WHERE id = ?", [insert.lastID]);

    await writeAuditLog({
      userId: user.sub,
      action: "client.created",
      targetType: "client",
      targetId: insert.lastID,
      details: JSON.stringify({ fullName: payload.fullName, branchId, officerId: selectedOfficerId }),
      ipAddress,
    });
    await invalidateReportCaches();

    return { status: 201, body: client };
  }

  async function updateClientKyc(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await get("SELECT id, branch_id, kyc_status FROM clients WHERE id = ?", [clientId]);
    if (!client) {
      return { status: 404, body: { message: "Client not found" } };
    }
    if (!hierarchyService.isBranchInScope(scope, client.branch_id)) {
      return { status: 403, body: { message: "Forbidden: client is outside your scope" } };
    }

    const previousStatus = String(client.kyc_status || "pending").toLowerCase();
    if (previousStatus === payload.status) {
      const unchangedClient = await get("SELECT * FROM clients WHERE id = ?", [clientId]);
      return { status: 200, body: { message: "Client KYC status is unchanged", client: unchangedClient } };
    }

    const updatedAt = new Date().toISOString();
    await run(
      `
        UPDATE clients
        SET kyc_status = ?, updated_at = ?
        WHERE id = ?
      `,
      [payload.status, updatedAt, clientId],
    );

    await syncClientOnboardingStatus(clientId);
    const updatedClient = await get("SELECT * FROM clients WHERE id = ?", [clientId]);
    await writeAuditLog({
      userId: user.sub,
      action: "client.kyc_status.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        previousStatus,
        nextStatus: payload.status,
        note: payload.note || null,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return { status: 200, body: { message: "Client KYC status updated", client: updatedClient } };
  }

  async function updateClient(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const client = resolved.client;
    const setClauses: string[] = [];
    const queryParams: unknown[] = [];
    const changedFields: Record<string, unknown> = {};
    const updatedAt = new Date().toISOString();

    if (typeof payload.fullName === "string" && payload.fullName !== client.full_name) {
      setClauses.push("full_name = ?");
      queryParams.push(payload.fullName);
      changedFields.fullName = payload.fullName;
    }

    if (hasOwn(payload, "phone")) {
      const nextPhone = payload.phone || null;
      const currentPhone = client.phone || null;
      if (nextPhone !== currentPhone) {
        setClauses.push("phone = ?");
        queryParams.push(nextPhone);
        changedFields.phone = nextPhone;
      }
    }

    if (hasOwn(payload, "kraPin")) {
      setClauses.push("kra_pin = ?");
      queryParams.push(payload.kraPin || null);
      changedFields.kraPin = payload.kraPin;
    }
    if (hasOwn(payload, "photoUrl")) {
      setClauses.push("photo_url = ?");
      queryParams.push(payload.photoUrl || null);
      changedFields.photoUrl = payload.photoUrl;
    }
    if (hasOwn(payload, "idDocumentUrl")) {
      setClauses.push("id_document_url = ?");
      queryParams.push(payload.idDocumentUrl || null);
      changedFields.idDocumentUrl = payload.idDocumentUrl;
    }
    if (hasOwn(payload, "nextOfKinName")) {
      setClauses.push("next_of_kin_name = ?");
      queryParams.push(payload.nextOfKinName || null);
      changedFields.nextOfKinName = payload.nextOfKinName;
    }
    if (hasOwn(payload, "nextOfKinPhone")) {
      setClauses.push("next_of_kin_phone = ?");
      queryParams.push(payload.nextOfKinPhone || null);
      changedFields.nextOfKinPhone = payload.nextOfKinPhone;
    }
    if (hasOwn(payload, "nextOfKinRelation")) {
      setClauses.push("next_of_kin_relation = ?");
      queryParams.push(payload.nextOfKinRelation || null);
      changedFields.nextOfKinRelation = payload.nextOfKinRelation;
    }
    if (hasOwn(payload, "businessType")) {
      setClauses.push("business_type = ?");
      queryParams.push(payload.businessType || null);
      changedFields.businessType = payload.businessType;
    }
    if (hasOwn(payload, "businessYears")) {
      setClauses.push("business_years = ?");
      queryParams.push(payload.businessYears || null);
      changedFields.businessYears = payload.businessYears;
    }
    if (hasOwn(payload, "businessLocation")) {
      setClauses.push("business_location = ?");
      queryParams.push(payload.businessLocation || null);
      changedFields.businessLocation = payload.businessLocation;
    }
    if (hasOwn(payload, "residentialAddress")) {
      setClauses.push("residential_address = ?");
      queryParams.push(payload.residentialAddress || null);
      changedFields.residentialAddress = payload.residentialAddress;
    }
    if (hasOwn(payload, "officerId")) {
      setClauses.push("officer_id = ?");
      queryParams.push(payload.officerId || null);
      changedFields.officerId = payload.officerId;
    }

    if (hasOwn(payload, "nationalId")) {
      const nextNationalId = payload.nationalId || null;
      const currentNationalId = client.national_id || null;
      if (nextNationalId !== currentNationalId) {
        if (await hasDuplicateNationalId(nextNationalId, clientId)) {
          return { status: 409, body: { message: "A client with this national ID already exists" } };
        }

        setClauses.push("national_id = ?");
        queryParams.push(nextNationalId);
        changedFields.nationalId = nextNationalId;
      }
    }

    if (hasOwn(payload, "isActive")) {
      const nextIsActive = payload.isActive ? 1 : 0;
      const currentIsActive = Number(client.is_active || 0);
      if (nextIsActive !== currentIsActive) {
        setClauses.push("is_active = ?");
        queryParams.push(nextIsActive);
        setClauses.push("deleted_at = ?");
        queryParams.push(nextIsActive === 1 ? null : updatedAt);
        changedFields.isActive = Boolean(payload.isActive);
      }
    }

    if (setClauses.length === 0) {
      return { status: 200, body: { message: "No client changes were applied", client } };
    }

    await run(
      `
        UPDATE clients
        SET ${setClauses.join(", ")}, updated_at = ?
        WHERE id = ?
      `,
      [...queryParams, updatedAt, clientId],
    );

    const updatedClient = await get("SELECT * FROM clients WHERE id = ?", [clientId]);
    await writeAuditLog({
      userId: user.sub,
      action: "client.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify(changedFields),
      ipAddress,
    });
    await invalidateReportCaches();

    return { status: 200, body: { message: "Client updated", client: updatedClient } };
  }

  async function listClients(query: QueryLike, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const format = normalizeExportFormat(query.format);
    if (!["json", "csv"].includes(format)) {
      return { status: 400, body: { message: "Invalid format. Use one of: json, csv." } };
    }

    const search = String(query.search || "").trim();
    const rawBranchId = String(query.branchId || "").trim();
    const parsedBranchId = rawBranchId ? Number(rawBranchId) : null;
    if (rawBranchId && (!Number.isInteger(parsedBranchId) || Number(parsedBranchId) <= 0)) {
      return { status: 400, body: { message: "Invalid branchId filter" } };
    }
    if (parsedBranchId && !hierarchyService.isBranchInScope(scope, parsedBranchId)) {
      return { status: 403, body: { message: "Forbidden: branchId is outside your scope" } };
    }

    const rawOfficerId = String(query.officerId || "").trim();
    const parsedOfficerId = rawOfficerId ? Number(rawOfficerId) : null;
    if (rawOfficerId && (!Number.isInteger(parsedOfficerId) || Number(parsedOfficerId) <= 0)) {
      return { status: 400, body: { message: "Invalid officerId filter" } };
    }

    const rawIsActive = String(query.isActive || "").trim().toLowerCase();
    let normalizedIsActive: 0 | 1 | undefined;
    if (rawIsActive) {
      if (!["true", "false", "1", "0", "active", "inactive"].includes(rawIsActive)) {
        return { status: 400, body: { message: "Invalid isActive filter. Use true or false" } };
      }
      normalizedIsActive = ["true", "1", "active"].includes(rawIsActive) ? 1 : 0;
    }

    const normalizedKycStatus = String(query.kycStatus || "").trim().toLowerCase();
    if (normalizedKycStatus && !["pending", "in_review", "verified", "rejected", "suspended"].includes(normalizedKycStatus)) {
      return { status: 400, body: { message: "Invalid kycStatus filter" } };
    }

    const normalizedOnboardingStatus = String(query.onboardingStatus || "").trim().toLowerCase();
    if (normalizedOnboardingStatus && !["registered", "kyc_pending", "kyc_verified", "complete"].includes(normalizedOnboardingStatus)) {
      return { status: 400, body: { message: "Invalid onboardingStatus filter" } };
    }

    const normalizedFeePaymentStatus = String(query.feePaymentStatus || "").trim().toLowerCase();
    if (normalizedFeePaymentStatus && !["unpaid", "paid", "waived"].includes(normalizedFeePaymentStatus)) {
      return { status: 400, body: { message: "Invalid feePaymentStatus filter" } };
    }

    const rawDormantOnly = String(query.dormantOnly || "").trim().toLowerCase();
    let dormantOnly = false;
    if (rawDormantOnly) {
      if (!["true", "1", "yes"].includes(rawDormantOnly)) {
        return { status: 400, body: { message: "Invalid dormantOnly filter. Use true" } };
      }
      dormantOnly = true;
    }

    const branchCondition = hierarchyService.buildScopeCondition(scope, "c.branch_id");

    const loanOfficerUserId = isLoanOfficer(user)
      ? Number(user?.sub)
      : null;
    const effectiveOfficerId = Number.isInteger(parsedOfficerId) && Number(parsedOfficerId) > 0
      ? Number(parsedOfficerId)
      : undefined;
    if (Number.isInteger(loanOfficerUserId) && Number(loanOfficerUserId) > 0 && effectiveOfficerId && effectiveOfficerId !== Number(loanOfficerUserId)) {
      return { status: 403, body: { message: "Forbidden: officerId is outside your assignment" } };
    }

    const parsedMinLoans = Number(query.minLoans);
    let minLoans: number | null = null;
    if (typeof query.minLoans !== "undefined" && String(query.minLoans).trim() !== "") {
      if (!Number.isFinite(parsedMinLoans) || !Number.isInteger(parsedMinLoans) || parsedMinLoans < 0) {
        return { status: 400, body: { message: "Invalid minLoans filter" } };
      }
      minLoans = parsedMinLoans;
    }
    const { limit, offset } = parsePaginationQuery(query, {
      defaultLimit: 50,
      maxLimit: 200,
      requirePagination: true,
      strict: true,
    });

    const { requestedSortBy, sortBy, sortOrder } = parseSortQuery(query, {
      sortFieldMap: {
        id: "id",
        fullName: "fullName",
        createdAt: "createdAt",
        loanCount: "loanCount",
      },
      defaultSortBy: "id",
      defaultSortOrder: "desc",
      sortByErrorMessage: "Invalid sortBy. Use one of: id, fullName, createdAt, loanCount",
    });

    const { rows: clients, total } = await clientReadRepository.listClients({
      search: search || undefined,
      branchId: Number.isInteger(parsedBranchId) && Number(parsedBranchId) > 0 ? Number(parsedBranchId) : undefined,
      officerId: effectiveOfficerId,
      isActive: normalizedIsActive,
      kycStatus: normalizedKycStatus || undefined,
      onboardingStatus: normalizedOnboardingStatus || undefined,
      feePaymentStatus: normalizedFeePaymentStatus || undefined,
      dormantOnly,
      scopeCondition: branchCondition,
      loanOfficerUserId: Number.isInteger(loanOfficerUserId) && Number(loanOfficerUserId) > 0
        ? Number(loanOfficerUserId)
        : undefined,
      minLoans,
      limit,
      offset,
      sortBy: sortBy as "id" | "fullName" | "createdAt" | "loanCount",
      sortOrder,
    });

    if (format === "csv") {
      const exportRows = mapClientListExportRows(clients);
      const headers = exportRows.length > 0
        ? Object.keys(exportRows[0])
        : [
          "BorrowerRef",
          "FullName",
          "Phone",
          "NationalId",
          "Branch",
          "Agent",
          "LoanCount",
          "CompletedLoans",
          "OpenLoans",
          "KycStatus",
          "OnboardingStatus",
          "FeePaymentStatus",
          "Active",
          "CreatedAt",
          "UpdatedAt",
        ];
      const exportPayload = buildTabularExport({
        format,
        filenameBase: buildClientListExportFilename(dormantOnly),
        title: dormantOnly ? "Dormant borrowers" : "Borrowers",
        headers,
        rows: exportRows,
        csvQuoteAllFields: true,
      });

      return {
        status: 200,
        body: exportPayload.body,
        headers: {
          "Content-Type": exportPayload.contentType || "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportPayload.filename || "borrowers.csv"}"`,
        },
      };
    }

    return {
      status: 200,
      body: createPagedResponse({
        data: clients,
        total,
        limit,
        offset,
        sortBy: requestedSortBy,
        sortOrder,
      }),
    };
  }

  async function findPotentialDuplicates(payload: Record<string, any>, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const normalizedNationalId = normalizeNationalId(payload.nationalId);
    const normalizedPhone = normalizePhone(payload.phone);
    const normalizedName = normalizeName(payload.name);

    const branchCondition = hierarchyService.buildScopeCondition(scope, "c.branch_id");
    const limit = payload.limit || 25;

    const loanOfficerUserId = isLoanOfficer(user)
      ? Number(user?.sub)
      : null;

    const candidates = await clientReadRepository.findPotentialDuplicateCandidates({
      normalizedNationalId: normalizedNationalId || undefined,
      normalizedPhone: normalizedPhone || undefined,
      normalizedName: normalizedName || undefined,
      nameTokens: tokenizeName(normalizedName),
      scopeCondition: branchCondition,
      loanOfficerUserId: Number.isInteger(loanOfficerUserId) && Number(loanOfficerUserId) > 0
        ? Number(loanOfficerUserId)
        : undefined,
      limit: Number(limit),
    });

    const duplicates: PotentialDuplicateResult[] = candidates
      .map((client) => {
        const scored = scorePotentialDuplicate(
          {
            nationalId: normalizedNationalId,
            phone: normalizedPhone,
            name: normalizedName,
          },
          client,
        );
        return {
          ...client,
          matchScore: scored.score,
          matchSignals: scored.signals,
        };
      })
      .filter((client) => client.matchScore >= 35)
      .sort(
        (left: PotentialDuplicateResult, right: PotentialDuplicateResult) =>
          right.matchScore - left.matchScore || Number(right.id || 0) - Number(left.id || 0),
      )
      .slice(0, limit);

    return {
      status: 200,
      body: {
        query: {
          nationalId: payload.nationalId || null,
          phone: payload.phone || null,
          name: payload.name || null,
        },
        total: duplicates.length,
        duplicates,
      },
    };
  }

  async function listAssignableOfficers(user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const officers = await all(
      `
        SELECT
          u.id,
          u.full_name,
          u.branch_id,
          b.name AS branch_name,
          r.name AS region_name,
          COUNT(c.id) AS assigned_portfolio_count
        FROM users u
        LEFT JOIN branches b ON b.id = u.branch_id
        LEFT JOIN regions r ON r.id = COALESCE(u.primary_region_id, b.region_id)
        LEFT JOIN clients c ON c.officer_id = u.id AND c.deleted_at IS NULL
        WHERE LOWER(u.role) = 'loan_officer'
          AND u.is_active = 1
        GROUP BY u.id, u.full_name, u.branch_id, b.name, r.name
        ORDER BY u.full_name ASC, u.id ASC
      `,
    );

    return {
      status: 200,
      body: officers
        .filter((officer) => hierarchyService.isBranchInScope(scope, officer.branch_id))
        .map((officer) => ({
          id: Number(officer.id),
          full_name: String(officer.full_name || '').trim(),
          branch_id: officer.branch_id == null ? null : Number(officer.branch_id),
          branch_name: officer.branch_name || null,
          region_name: officer.region_name || null,
          assigned_portfolio_count: Number(officer.assigned_portfolio_count || 0),
        }))
        .filter((officer) => officer.id > 0 && officer.full_name),
    };
  }

  async function reallocatePortfolio(payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const fromOfficerId = Number(payload.fromOfficerId || 0);
    const toOfficerId = Number(payload.toOfficerId || 0);
    const note = String(payload.note || '').trim() || null;

    const [fromOfficer, toOfficer] = await Promise.all([
      get(
        `
          SELECT id, full_name, role, is_active, branch_id
          FROM users
          WHERE id = ?
        `,
        [fromOfficerId],
      ),
      get(
        `
          SELECT id, full_name, role, is_active, branch_id
          FROM users
          WHERE id = ?
        `,
        [toOfficerId],
      ),
    ]);

    if (!fromOfficer || String(fromOfficer.role || '').trim().toLowerCase() !== 'loan_officer' || Number(fromOfficer.is_active || 0) !== 1) {
      return { status: 400, body: { message: 'Selected source agent is invalid.' } };
    }

    if (!toOfficer || String(toOfficer.role || '').trim().toLowerCase() !== 'loan_officer' || Number(toOfficer.is_active || 0) !== 1) {
      return { status: 400, body: { message: 'Selected target agent is invalid.' } };
    }

    if (!hierarchyService.isBranchInScope(scope, fromOfficer.branch_id) || !hierarchyService.isBranchInScope(scope, toOfficer.branch_id)) {
      return { status: 403, body: { message: 'Forbidden: one or more agents are outside your scope.' } };
    }

    if (Number(fromOfficer.branch_id || 0) !== Number(toOfficer.branch_id || 0)) {
      return { status: 400, body: { message: 'Portfolio reallocation requires both agents to belong to the same branch.' } };
    }

    const portfolioCountRow = await get(
      `
        SELECT COUNT(*) AS total
        FROM clients c
        WHERE c.officer_id = ?
          AND c.deleted_at IS NULL
          AND c.branch_id = ?
      `,
      [fromOfficerId, Number(fromOfficer.branch_id || 0)],
    );

    const totalClients = Number(portfolioCountRow?.total || 0);
    if (totalClients === 0) {
      return {
        status: 200,
        body: {
          message: 'No borrower portfolio was available to reallocate.',
          movedClients: 0,
          fromOfficer: { id: Number(fromOfficer.id), full_name: fromOfficer.full_name || null },
          toOfficer: { id: Number(toOfficer.id), full_name: toOfficer.full_name || null },
        },
      };
    }

    const updatedAt = new Date().toISOString();
    const updateResult = await run(
      `
        UPDATE clients
        SET officer_id = ?, updated_at = ?
        WHERE officer_id = ?
          AND deleted_at IS NULL
          AND branch_id = ?
      `,
      [toOfficerId, updatedAt, fromOfficerId, Number(fromOfficer.branch_id || 0)],
    );

    const movedClients = Number(updateResult?.changes || totalClients || 0);

    await writeAuditLog({
      userId: user.sub,
      action: 'client.portfolio_reallocated',
      targetType: 'user',
      targetId: toOfficerId,
      details: JSON.stringify({
        fromOfficerId,
        fromOfficerName: fromOfficer.full_name || null,
        toOfficerId,
        toOfficerName: toOfficer.full_name || null,
        movedClients,
        note,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: `Portfolio reallocated successfully from ${fromOfficer.full_name} to ${toOfficer.full_name}.`,
        movedClients,
        fromOfficer: { id: Number(fromOfficer.id), full_name: fromOfficer.full_name || null },
        toOfficer: { id: Number(toOfficer.id), full_name: toOfficer.full_name || null },
        note,
      },
    };
  }

  async function getClientWithLoans(clientId: number, user: UserLike) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const loans = await all(
      `
        SELECT id, principal, interest_rate, term_months, term_weeks, registration_fee, processing_fee, expected_total, repaid_total, balance, status, disbursed_at, branch_id
        FROM loans
        WHERE client_id = ?
        ORDER BY id DESC
      `,
      [clientId],
    );

    return { status: 200, body: { ...resolved.client, loans } };
  }

  async function addClientGuarantor(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    if (payload.nationalId) {
      const existingGuarantor = await get(
        `
          SELECT id
          FROM guarantors
          WHERE LOWER(TRIM(COALESCE(national_id, ''))) = LOWER(TRIM(?))
        `,
        [payload.nationalId],
      );
      if (existingGuarantor) {
        return { status: 409, body: { message: "A guarantor with this national ID already exists" } };
      }
    }

    const createdAt = new Date().toISOString();
    const insertResult = await run(
      `
        INSERT INTO guarantors (
          full_name,
          phone,
          national_id,
          physical_address,
          occupation,
          employer_name,
          monthly_income,
          guarantee_amount,
          client_id,
          branch_id,
          created_by_user_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        payload.fullName,
        payload.phone || null,
        payload.nationalId || null,
        payload.physicalAddress || null,
        payload.occupation || null,
        payload.employerName || null,
        payload.monthlyIncome || 0,
        payload.guaranteeAmount,
        clientId,
        resolved.client.branch_id || null,
        user.sub,
        createdAt,
        createdAt,
      ],
    );

    const guarantor = await get("SELECT * FROM guarantors WHERE id = ?", [insertResult.lastID]);
    const onboarding = await syncClientOnboardingStatus(clientId);

    await writeAuditLog({
      userId: user.sub,
      action: "client.guarantor.created",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        guarantorId: Number(insertResult.lastID),
        fullName: payload.fullName,
        onboardingStatus: onboarding.nextStatus,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 201,
      body: {
        guarantor,
        onboardingStatus: onboarding.nextStatus,
      },
    };
  }

  async function getClientGuarantors(clientId: number, user: UserLike) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const guarantors = await all(
      `
        SELECT *
        FROM guarantors
        WHERE client_id = ?
        ORDER BY id DESC
      `,
      [clientId],
    );

    return { status: 200, body: guarantors };
  }

  async function updateClientGuarantor(
    clientId: number,
    guarantorId: number,
    payload: Record<string, any>,
    user: UserLike,
    ipAddress: string,
  ) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const guarantor = await get(
      `
        SELECT *
        FROM guarantors
        WHERE id = ? AND client_id = ?
      `,
      [guarantorId, clientId],
    );
    if (!guarantor) {
      return { status: 404, body: { message: "Guarantor not found" } };
    }

    const setClauses: string[] = [];
    const queryParams: unknown[] = [];
    const changedFields: Record<string, unknown> = {};
    const updatedAt = new Date().toISOString();

    if (typeof payload.fullName === "string" && payload.fullName !== guarantor.full_name) {
      setClauses.push("full_name = ?");
      queryParams.push(payload.fullName);
      changedFields.fullName = payload.fullName;
    }

    if (hasOwn(payload, "phone")) {
      const nextPhone = payload.phone || null;
      const currentPhone = guarantor.phone || null;
      if (nextPhone !== currentPhone) {
        setClauses.push("phone = ?");
        queryParams.push(nextPhone);
        changedFields.phone = nextPhone;
      }
    }

    if (hasOwn(payload, "nationalId")) {
      const nextNationalId = payload.nationalId || null;
      const currentNationalId = guarantor.national_id || null;
      if (nextNationalId !== currentNationalId) {
        if (nextNationalId) {
          const existingGuarantor = await get(
            `
              SELECT id
              FROM guarantors
              WHERE id != ?
                AND LOWER(TRIM(COALESCE(national_id, ''))) = LOWER(TRIM(?))
            `,
            [guarantorId, nextNationalId],
          );
          if (existingGuarantor) {
            return { status: 409, body: { message: "A guarantor with this national ID already exists" } };
          }
        }

        setClauses.push("national_id = ?");
        queryParams.push(nextNationalId);
        changedFields.nationalId = nextNationalId;
      }
    }

    if (hasOwn(payload, "physicalAddress")) {
      const nextPhysicalAddress = payload.physicalAddress || null;
      const currentPhysicalAddress = guarantor.physical_address || null;
      if (nextPhysicalAddress !== currentPhysicalAddress) {
        setClauses.push("physical_address = ?");
        queryParams.push(nextPhysicalAddress);
        changedFields.physicalAddress = nextPhysicalAddress;
      }
    }

    if (hasOwn(payload, "occupation")) {
      const nextOccupation = payload.occupation || null;
      const currentOccupation = guarantor.occupation || null;
      if (nextOccupation !== currentOccupation) {
        setClauses.push("occupation = ?");
        queryParams.push(nextOccupation);
        changedFields.occupation = nextOccupation;
      }
    }

    if (hasOwn(payload, "employerName")) {
      const nextEmployerName = payload.employerName || null;
      const currentEmployerName = guarantor.employer_name || null;
      if (nextEmployerName !== currentEmployerName) {
        setClauses.push("employer_name = ?");
        queryParams.push(nextEmployerName);
        changedFields.employerName = nextEmployerName;
      }
    }

    if (hasOwn(payload, "monthlyIncome")) {
      const nextMonthlyIncome = payload.monthlyIncome == null ? null : Number(payload.monthlyIncome);
      const currentMonthlyIncome = guarantor.monthly_income == null ? null : Number(guarantor.monthly_income);
      if (nextMonthlyIncome !== currentMonthlyIncome) {
        setClauses.push("monthly_income = ?");
        queryParams.push(nextMonthlyIncome ?? 0);
        changedFields.monthlyIncome = nextMonthlyIncome;
      }
    }

    if (hasOwn(payload, "guaranteeAmount")) {
      const nextGuaranteeAmount = Number(payload.guaranteeAmount);
      const currentGuaranteeAmount = Number(guarantor.guarantee_amount || 0);
      if (nextGuaranteeAmount !== currentGuaranteeAmount) {
        setClauses.push("guarantee_amount = ?");
        queryParams.push(nextGuaranteeAmount);
        changedFields.guaranteeAmount = nextGuaranteeAmount;
      }
    }

    if (setClauses.length === 0) {
      const onboarding = await syncClientOnboardingStatus(clientId);
      return {
        status: 200,
        body: {
          message: "No guarantor changes were applied",
          guarantor,
          onboardingStatus: onboarding.nextStatus,
        },
      };
    }

    await run(
      `
        UPDATE guarantors
        SET ${setClauses.join(", ")}, updated_at = ?
        WHERE id = ? AND client_id = ?
      `,
      [...queryParams, updatedAt, guarantorId, clientId],
    );

    const updatedGuarantor = await get("SELECT * FROM guarantors WHERE id = ?", [guarantorId]);
    const onboarding = await syncClientOnboardingStatus(clientId);
    await refreshLinkedLoanAssessmentsForGuarantor(guarantorId);

    await writeAuditLog({
      userId: user.sub,
      action: "client.guarantor.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        guarantorId,
        changes: changedFields,
        onboardingStatus: onboarding.nextStatus,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: "Client guarantor updated",
        guarantor: updatedGuarantor,
        onboardingStatus: onboarding.nextStatus,
      },
    };
  }

  async function addClientCollateral(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    if (payload.registrationNumber) {
      const existingByRegistration = await get(
        `
          SELECT id
          FROM collateral_assets
          WHERE LOWER(TRIM(COALESCE(registration_number, ''))) = LOWER(TRIM(?))
        `,
        [payload.registrationNumber],
      );
      if (existingByRegistration) {
        return { status: 409, body: { message: "A collateral asset with this registration number already exists" } };
      }
    }
    if (payload.logbookNumber) {
      const existingByLogbook = await get(
        `
          SELECT id
          FROM collateral_assets
          WHERE LOWER(TRIM(COALESCE(logbook_number, ''))) = LOWER(TRIM(?))
        `,
        [payload.logbookNumber],
      );
      if (existingByLogbook) {
        return { status: 409, body: { message: "A collateral asset with this logbook number already exists" } };
      }
    }
    if (payload.titleNumber) {
      const existingByTitle = await get(
        `
          SELECT id
          FROM collateral_assets
          WHERE LOWER(TRIM(COALESCE(title_number, ''))) = LOWER(TRIM(?))
        `,
        [payload.titleNumber],
      );
      if (existingByTitle) {
        return { status: 409, body: { message: "A collateral asset with this title number already exists" } };
      }
    }

    const createdAt = new Date().toISOString();
    const insertResult = await run(
      `
        INSERT INTO collateral_assets (
          asset_type,
          description,
          estimated_value,
          ownership_type,
          owner_name,
          owner_national_id,
          registration_number,
          logbook_number,
          title_number,
          location_details,
          valuation_date,
          status,
          client_id,
          branch_id,
          created_by_user_id,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `,
      [
        payload.assetType,
        payload.description,
        payload.estimatedValue,
        payload.ownershipType || "client",
        payload.ownerName || null,
        payload.ownerNationalId || null,
        payload.registrationNumber || null,
        payload.logbookNumber || null,
        payload.titleNumber || null,
        payload.locationDetails || null,
        payload.valuationDate || null,
        clientId,
        resolved.client.branch_id || null,
        user.sub,
        createdAt,
        createdAt,
      ],
    );

    const collateralAsset = await get("SELECT * FROM collateral_assets WHERE id = ?", [insertResult.lastID]);
    const onboarding = await syncClientOnboardingStatus(clientId);

    await writeAuditLog({
      userId: user.sub,
      action: "client.collateral.created",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        collateralAssetId: Number(insertResult.lastID),
        assetType: payload.assetType,
        estimatedValue: payload.estimatedValue,
        onboardingStatus: onboarding.nextStatus,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 201,
      body: {
        collateral: collateralAsset,
        onboardingStatus: onboarding.nextStatus,
      },
    };
  }

  async function getClientCollaterals(clientId: number, user: UserLike) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const collaterals = await all(
      `
        SELECT *
        FROM collateral_assets
        WHERE client_id = ?
        ORDER BY id DESC
      `,
      [clientId],
    );

    return { status: 200, body: collaterals };
  }

  async function updateClientCollateral(
    clientId: number,
    collateralId: number,
    payload: Record<string, any>,
    user: UserLike,
    ipAddress: string,
  ) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const collateral = await get(
      `
        SELECT *
        FROM collateral_assets
        WHERE id = ? AND client_id = ?
      `,
      [collateralId, clientId],
    );
    if (!collateral) {
      return { status: 404, body: { message: "Collateral asset not found" } };
    }

    const setClauses: string[] = [];
    const queryParams: unknown[] = [];
    const changedFields: Record<string, unknown> = {};
    const updatedAt = new Date().toISOString();

    if (typeof payload.assetType === "string" && payload.assetType !== collateral.asset_type) {
      setClauses.push("asset_type = ?");
      queryParams.push(payload.assetType);
      changedFields.assetType = payload.assetType;
    }

    if (typeof payload.description === "string" && payload.description !== collateral.description) {
      setClauses.push("description = ?");
      queryParams.push(payload.description);
      changedFields.description = payload.description;
    }

    if (typeof payload.estimatedValue === "number") {
      const nextEstimatedValue = Number(payload.estimatedValue);
      const currentEstimatedValue = Number(collateral.estimated_value || 0);
      if (nextEstimatedValue !== currentEstimatedValue) {
        setClauses.push("estimated_value = ?");
        queryParams.push(nextEstimatedValue);
        changedFields.estimatedValue = nextEstimatedValue;
      }
    }

    if (typeof payload.ownershipType === "string" && payload.ownershipType !== collateral.ownership_type) {
      setClauses.push("ownership_type = ?");
      queryParams.push(payload.ownershipType);
      changedFields.ownershipType = payload.ownershipType;
    }

    if (hasOwn(payload, "ownerName")) {
      const nextOwnerName = payload.ownerName || null;
      const currentOwnerName = collateral.owner_name || null;
      if (nextOwnerName !== currentOwnerName) {
        setClauses.push("owner_name = ?");
        queryParams.push(nextOwnerName);
        changedFields.ownerName = nextOwnerName;
      }
    }

    if (hasOwn(payload, "ownerNationalId")) {
      const nextOwnerNationalId = payload.ownerNationalId || null;
      const currentOwnerNationalId = collateral.owner_national_id || null;
      if (nextOwnerNationalId !== currentOwnerNationalId) {
        setClauses.push("owner_national_id = ?");
        queryParams.push(nextOwnerNationalId);
        changedFields.ownerNationalId = nextOwnerNationalId;
      }
    }

    if (hasOwn(payload, "registrationNumber")) {
      const nextRegistrationNumber = payload.registrationNumber || null;
      const currentRegistrationNumber = collateral.registration_number || null;
      if (nextRegistrationNumber !== currentRegistrationNumber) {
        if (nextRegistrationNumber) {
          const existingByRegistration = await get(
            `
              SELECT id
              FROM collateral_assets
              WHERE id != ?
                AND LOWER(TRIM(COALESCE(registration_number, ''))) = LOWER(TRIM(?))
            `,
            [collateralId, nextRegistrationNumber],
          );
          if (existingByRegistration) {
            return { status: 409, body: { message: "A collateral asset with this registration number already exists" } };
          }
        }

        setClauses.push("registration_number = ?");
        queryParams.push(nextRegistrationNumber);
        changedFields.registrationNumber = nextRegistrationNumber;
      }
    }

    if (hasOwn(payload, "logbookNumber")) {
      const nextLogbookNumber = payload.logbookNumber || null;
      const currentLogbookNumber = collateral.logbook_number || null;
      if (nextLogbookNumber !== currentLogbookNumber) {
        if (nextLogbookNumber) {
          const existingByLogbook = await get(
            `
              SELECT id
              FROM collateral_assets
              WHERE id != ?
                AND LOWER(TRIM(COALESCE(logbook_number, ''))) = LOWER(TRIM(?))
            `,
            [collateralId, nextLogbookNumber],
          );
          if (existingByLogbook) {
            return { status: 409, body: { message: "A collateral asset with this logbook number already exists" } };
          }
        }

        setClauses.push("logbook_number = ?");
        queryParams.push(nextLogbookNumber);
        changedFields.logbookNumber = nextLogbookNumber;
      }
    }

    if (hasOwn(payload, "titleNumber")) {
      const nextTitleNumber = payload.titleNumber || null;
      const currentTitleNumber = collateral.title_number || null;
      if (nextTitleNumber !== currentTitleNumber) {
        if (nextTitleNumber) {
          const existingByTitle = await get(
            `
              SELECT id
              FROM collateral_assets
              WHERE id != ?
                AND LOWER(TRIM(COALESCE(title_number, ''))) = LOWER(TRIM(?))
            `,
            [collateralId, nextTitleNumber],
          );
          if (existingByTitle) {
            return { status: 409, body: { message: "A collateral asset with this title number already exists" } };
          }
        }

        setClauses.push("title_number = ?");
        queryParams.push(nextTitleNumber);
        changedFields.titleNumber = nextTitleNumber;
      }
    }

    if (hasOwn(payload, "locationDetails")) {
      const nextLocationDetails = payload.locationDetails || null;
      const currentLocationDetails = collateral.location_details || null;
      if (nextLocationDetails !== currentLocationDetails) {
        setClauses.push("location_details = ?");
        queryParams.push(nextLocationDetails);
        changedFields.locationDetails = nextLocationDetails;
      }
    }

    if (hasOwn(payload, "valuationDate")) {
      const nextValuationDate = payload.valuationDate || null;
      const currentValuationDate = collateral.valuation_date || null;
      if (nextValuationDate !== currentValuationDate) {
        setClauses.push("valuation_date = ?");
        queryParams.push(nextValuationDate);
        changedFields.valuationDate = nextValuationDate;
      }
    }

    if (setClauses.length === 0) {
      const onboarding = await syncClientOnboardingStatus(clientId);
      return {
        status: 200,
        body: {
          message: "No collateral changes were applied",
          collateral,
          onboardingStatus: onboarding.nextStatus,
        },
      };
    }

    await run(
      `
        UPDATE collateral_assets
        SET ${setClauses.join(", ")}, updated_at = ?
        WHERE id = ? AND client_id = ?
      `,
      [...queryParams, updatedAt, collateralId, clientId],
    );

    const updatedCollateral = await get("SELECT * FROM collateral_assets WHERE id = ?", [collateralId]);
    const onboarding = await syncClientOnboardingStatus(clientId);
    await refreshLinkedLoanAssessmentsForCollateral(collateralId);

    await writeAuditLog({
      userId: user.sub,
      action: "client.collateral.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        collateralAssetId: collateralId,
        changes: changedFields,
        onboardingStatus: onboarding.nextStatus,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: "Client collateral updated",
        collateral: updatedCollateral,
        onboardingStatus: onboarding.nextStatus,
      },
    };
  }

  async function recordClientFeePayment(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const paidAtIso = String(payload.paidAt || "").trim() || new Date().toISOString();
    const updatedAt = new Date().toISOString();

    await run(
      `
        UPDATE clients
        SET
          fee_payment_status = 'paid',
          fees_paid_at = ?,
          updated_at = ?
        WHERE id = ?
      `,
      [paidAtIso, updatedAt, clientId],
    );

    const onboarding = await syncClientOnboardingStatus(clientId);
    const updatedClient = await get("SELECT * FROM clients WHERE id = ?", [clientId]);

    await writeAuditLog({
      userId: user.sub,
      action: "client.fees.recorded",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        amount: payload.amount || null,
        paymentReference: payload.paymentReference || null,
        paidAt: paidAtIso,
        note: payload.note || null,
        onboardingStatus: onboarding.nextStatus,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: "Client fee payment recorded",
        client: updatedClient,
        onboardingStatus: onboarding.nextStatus,
      },
    };
  }

  async function getClientOnboardingStatus(clientId: number, user: UserLike) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const onboarding = await syncClientOnboardingStatus(clientId);
    const complete = onboarding.nextStatus === "complete";
    const readyForLoanApplication = complete;
    const checklist = {
      guarantorAdded: onboarding.guarantorCount > 0,
      collateralAdded: onboarding.collateralCount > 0,
      feesPaid: onboarding.feesPaid,
      complete,
    };
    return {
      status: 200,
      body: {
        clientId,
        onboardingStatus: onboarding.nextStatus,
        kycStatus: onboarding.kycStatus,
        feePaymentStatus: onboarding.feePaymentStatus,
        feesPaidAt: onboarding.feesPaidAt,
        readyForLoanApplication,
        checklist,
        counts: {
          guarantors: onboarding.guarantorCount,
          collaterals: onboarding.collateralCount,
        },
        nextStep: onboarding.nextStep,
      },
    };
  }

  async function getClientHistory(clientId: number, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await get(
      `
        SELECT
          c.*,
          b.name AS branch_name,
          b.code AS branch_code,
          r.id AS region_id,
          r.name AS region_name,
          COALESCE(officer.full_name, creator.full_name) AS assigned_officer_name,
          COALESCE(c.officer_id, c.created_by_user_id) AS assigned_officer_id,
          creator.full_name AS created_by_name
        FROM clients c
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN regions r ON r.id = b.region_id
        LEFT JOIN users officer ON officer.id = c.officer_id
        LEFT JOIN users creator ON creator.id = c.created_by_user_id
        WHERE c.id = ?
      `,
      [clientId],
    );

    if (!client) {
      return { status: 404, body: { message: "Client not found" } };
    }
    if (!hierarchyService.isBranchInScope(scope, client.branch_id)) {
      return { status: 403, body: { message: "Forbidden: client is outside your scope" } };
    }
    if (!canAccessClientByOwnership(user, client)) {
      return { status: 403, body: { message: "Forbidden: client is outside your assignment" } };
    }

    const [loanSummaryRow, overdueHistoryRow, loans, repaymentHistory, collectionActions] = await Promise.all([
      get(
        `
          SELECT
            COUNT(*) AS total_loans,
            SUM(CASE WHEN l.status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            SUM(CASE WHEN l.status = 'closed' THEN 1 ELSE 0 END) AS closed_loans,
            SUM(CASE WHEN l.status = 'restructured' THEN 1 ELSE 0 END) AS restructured_loans,
            SUM(CASE WHEN l.status = 'written_off' THEN 1 ELSE 0 END) AS written_off_loans,
            SUM(CASE WHEN l.status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_approval_loans,
            SUM(CASE WHEN l.status = 'approved' THEN 1 ELSE 0 END) AS approved_loans,
            SUM(CASE WHEN l.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_loans,
            COALESCE(SUM(l.principal), 0) AS total_principal_disbursed,
            COALESCE(SUM(l.expected_total), 0) AS total_expected_total,
            COALESCE(SUM(l.repaid_total), 0) AS total_repaid,
            COALESCE(SUM(CASE WHEN l.status IN ('active', 'restructured') THEN l.balance ELSE 0 END), 0) AS total_outstanding_balance,
            MIN(l.disbursed_at) AS first_disbursed_at,
            MAX(l.disbursed_at) AS latest_disbursed_at
          FROM loans l
          WHERE l.client_id = ?
        `,
        [clientId],
      ),
      get(
        `
          SELECT
            COUNT(i.id) AS total_installments,
            COUNT(DISTINCT CASE
              WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now') THEN l.id
              ELSE NULL
            END) AS currently_overdue_loans,
            SUM(CASE
              WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now') THEN 1
              ELSE 0
            END) AS currently_overdue_installments,
            COALESCE(SUM(CASE
              WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now')
                THEN i.amount_due - i.amount_paid
              ELSE 0
            END), 0) AS currently_overdue_amount,
            SUM(CASE
              WHEN i.paid_at IS NOT NULL AND datetime(i.paid_at) > datetime(i.due_date) THEN 1
              ELSE 0
            END) AS paid_late_installments,
            COALESCE(ROUND(AVG(CASE
              WHEN i.paid_at IS NOT NULL AND datetime(i.paid_at) > datetime(i.due_date)
                THEN julianday(i.paid_at) - julianday(i.due_date)
              ELSE NULL
            END), 2), 0) AS avg_days_late_paid_installments,
            COALESCE(MAX(CASE
              WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now')
                THEN CAST(julianday('now') - julianday(i.due_date) AS INTEGER)
              ELSE NULL
            END), 0) AS max_current_days_overdue
          FROM loans l
          LEFT JOIN loan_installments i ON i.loan_id = l.id
          WHERE l.client_id = ?
        `,
        [clientId],
      ),
      all(
        `
          SELECT
            l.id,
            l.client_id,
            l.principal,
            l.interest_rate,
            l.term_months,
            l.term_weeks,
            l.registration_fee,
            l.processing_fee,
            l.expected_total,
            l.repaid_total,
            l.balance,
            l.status,
            l.disbursed_at,
            l.approved_at,
            l.rejected_at,
            l.rejection_reason,
            l.officer_id,
            officer.full_name AS officer_name,
            COUNT(i.id) AS installment_count,
            SUM(CASE WHEN i.status = 'paid' THEN 1 ELSE 0 END) AS paid_installment_count,
            SUM(CASE WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now') THEN 1 ELSE 0 END) AS overdue_installment_count,
            COALESCE(SUM(CASE
              WHEN i.status != 'paid' AND datetime(i.due_date) < datetime('now')
                THEN i.amount_due - i.amount_paid
              ELSE 0
            END), 0) AS overdue_amount
          FROM loans l
          LEFT JOIN users officer ON officer.id = l.officer_id
          LEFT JOIN loan_installments i ON i.loan_id = l.id
          WHERE l.client_id = ?
          GROUP BY l.id
          ORDER BY datetime(l.disbursed_at) DESC, l.id DESC
        `,
        [clientId],
      ),
      all(
        `
          SELECT
            r.id,
            r.loan_id,
            r.amount,
            r.paid_at,
            r.note,
            r.recorded_by_user_id,
            recorder.full_name AS recorded_by_name,
            l.status AS loan_status
          FROM repayments r
          INNER JOIN loans l ON l.id = r.loan_id
          LEFT JOIN users recorder ON recorder.id = r.recorded_by_user_id
          WHERE l.client_id = ?
          ORDER BY datetime(r.paid_at) DESC, r.id DESC
        `,
        [clientId],
      ),
      all(
        `
          SELECT
            ca.id,
            ca.loan_id,
            ca.installment_id,
            ca.action_type,
            ca.action_note,
            ca.promise_date,
            ca.next_follow_up_date,
            ca.action_status,
            ca.created_by_user_id,
            creator.full_name AS created_by_name,
            ca.created_at,
            l.status AS loan_status
          FROM collection_actions ca
          INNER JOIN loans l ON l.id = ca.loan_id
          LEFT JOIN users creator ON creator.id = ca.created_by_user_id
          WHERE l.client_id = ?
          ORDER BY datetime(ca.created_at) DESC, ca.id DESC
        `,
        [clientId],
      ),
    ]);

    const profile = {
      id: Number(client.id),
      full_name: client.full_name,
      phone: client.phone || null,
      national_id: client.national_id || null,
      is_active: Number(client.is_active || 0),
      deleted_at: client.deleted_at || null,
      branch_id: client.branch_id == null ? null : Number(client.branch_id),
      branch_name: client.branch_name || null,
      branch_code: client.branch_code || null,
      region_id: client.region_id == null ? null : Number(client.region_id),
      region_name: client.region_name || null,
      created_by_user_id: client.created_by_user_id == null ? null : Number(client.created_by_user_id),
      created_by_name: client.created_by_name || null,
      assigned_officer_id: client.assigned_officer_id == null ? null : Number(client.assigned_officer_id),
      assigned_officer_name: client.assigned_officer_name || null,
      kra_pin: client.kra_pin || null,
      photo_url: client.photo_url || null,
      id_document_url: client.id_document_url || null,
      business_type: client.business_type || null,
      business_years: client.business_years == null ? null : Number(client.business_years),
      business_location: client.business_location || null,
      residential_address: client.residential_address || null,
      next_of_kin_name: client.next_of_kin_name || null,
      next_of_kin_phone: client.next_of_kin_phone || null,
      next_of_kin_relation: client.next_of_kin_relation || null,
      created_at: client.created_at || null,
      updated_at: client.updated_at || null,
    };

    const overdueHistory = {
      total_installments: Number(overdueHistoryRow?.total_installments || 0),
      currently_overdue_loans: Number(overdueHistoryRow?.currently_overdue_loans || 0),
      currently_overdue_installments: Number(overdueHistoryRow?.currently_overdue_installments || 0),
      currently_overdue_amount: Number(overdueHistoryRow?.currently_overdue_amount || 0),
      paid_late_installments: Number(overdueHistoryRow?.paid_late_installments || 0),
      avg_days_late_paid_installments: Number(overdueHistoryRow?.avg_days_late_paid_installments || 0),
      max_current_days_overdue: Number(overdueHistoryRow?.max_current_days_overdue || 0),
    };

    const loanSummary = {
      total_loans: Number(loanSummaryRow?.total_loans || 0),
      active_loans: Number(loanSummaryRow?.active_loans || 0),
      closed_loans: Number(loanSummaryRow?.closed_loans || 0),
      restructured_loans: Number(loanSummaryRow?.restructured_loans || 0),
      written_off_loans: Number(loanSummaryRow?.written_off_loans || 0),
      pending_approval_loans: Number(loanSummaryRow?.pending_approval_loans || 0),
      approved_loans: Number(loanSummaryRow?.approved_loans || 0),
      rejected_loans: Number(loanSummaryRow?.rejected_loans || 0),
      total_principal_disbursed: Number(loanSummaryRow?.total_principal_disbursed || 0),
      total_expected_total: Number(loanSummaryRow?.total_expected_total || 0),
      total_repaid: Number(loanSummaryRow?.total_repaid || 0),
      total_outstanding_balance: Number(loanSummaryRow?.total_outstanding_balance || 0),
      total_repayment_transactions: repaymentHistory.length,
      first_disbursed_at: loanSummaryRow?.first_disbursed_at || null,
      latest_disbursed_at: loanSummaryRow?.latest_disbursed_at || null,
      overdue_history: overdueHistory,
    };

    return {
      status: 200,
      body: {
        clientProfile: profile,
        kycStatus: {
          status: String(client.kyc_status || "pending").toLowerCase(),
          isVerified: String(client.kyc_status || "").toLowerCase() === "verified",
        },
        loanSummary,
        loans,
        repaymentHistory,
        collectionActions,
      },
    };
  }

  return {
    createClient,
    updateClientKyc,
    updateClient,
    listClients,
    findPotentialDuplicates,
    listAssignableOfficers,
    reallocatePortfolio,
    getClientWithLoans,
    addClientGuarantor,
    getClientGuarantors,
    updateClientGuarantor,
    addClientCollateral,
    getClientCollaterals,
    updateClientCollateral,
    recordClientFeePayment,
    getClientOnboardingStatus,
    getClientHistory,
    computeGraduatedLimitForClient,
  };
}

export {
  createClientRouteService,
};


