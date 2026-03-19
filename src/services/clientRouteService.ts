import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../utils/http.js";
import { buildTabularExport } from "./reportExportService.js";
import type { ClientRouteDeps } from "../types/routeDeps.js";
import { createClientReadRepository } from "../repositories/clientReadRepository.js";
import { createLoanUnderwritingService } from "./loanUnderwritingService.js";
import { SqliteClientRepository } from "../infrastructure/repositories/SqliteClientRepository.js";
import { Client } from "../domain/client/entities/Client.js";
import { ClientId } from "../domain/client/value-objects/ClientId.js";
import { KycStatus } from "../domain/client/value-objects/KycStatus.js";
import { PhoneNumber } from "../domain/client/value-objects/PhoneNumber.js";
import { NationalId } from "../domain/client/value-objects/NationalId.js";
import {
  normalizeExportFormat,
  buildClientListExportFilename,
  mapClientListExportRows,
} from "./client/clientTransformers.js";
import {
  deriveOnboardingStatus,
  deriveOnboardingNextStep,
  normalizeName,
  normalizeNationalId,
  normalizePhone,
  tokenizeName,
  scorePotentialDuplicate,
  hasDuplicateNationalId,
} from "./client/clientValidation.js";
import { createClientOnboardingService } from "./client/clientOnboardingService.js";
import { createClientPortfolioService } from "./client/clientPortfolioService.js";

type UserLike = Record<string, any>;
type QueryLike = Record<string, any>;
type DbRow = Record<string, any>;
type DbGetLike = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAllLike = (sql: string, params?: unknown[]) => Promise<DbRow[]>;



type PotentialDuplicateResult = Record<string, unknown> & {
  id?: number | string;
  matchScore: number;
  matchSignals: string[];
};



function createClientRouteService(deps: ClientRouteDeps) {
  const {
    run,
    get,
    all,
    executeTransaction,
    writeAuditLog,
    hierarchyService,
    reportCache = null,
  } = deps;
  const clientReadRepository = createClientReadRepository({ all, get });
  const loanUnderwritingService = createLoanUnderwritingService({ get, run });
  // Domain layer: repository adapter wired from the same injected db functions
  const clientRepository = new SqliteClientRepository({ get, all: all ?? (async () => []), run });

  // Sub-services
  const portfolioService = createClientPortfolioService({
    get,
    all: all ?? (async () => []),
    run,
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    resolveClientScopeClient,
    canAccessClientByOwnership,
  });

  const onboardingService = createClientOnboardingService({
    get,
    all: all ?? (async () => []),
    run,
    executeTransaction,
    hierarchyService,
    clientRepository,
    writeAuditLog,
    invalidateReportCaches,
    resolveClientScopeClient,
    refreshLinkedLoanAssessmentsForGuarantor,
    refreshLinkedLoanAssessmentsForCollateral,
    hasOwn,
  });

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
    return onboardingService.createClient(payload, user, ipAddress);
  }
  async function updateClientKyc(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return onboardingService.updateClientKyc(clientId, payload, user, ipAddress);
  }

  async function updateClient(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    // Scope / ownership guard (still uses raw row for the branch-in-scope check)
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    // Load the domain aggregate via the repository
    const domainClient = await clientRepository.findById(ClientId.fromNumber(clientId));
    if (!domainClient) {
      return { status: 404, body: { message: "Client not found" } };
    }

    const changedFields: Record<string, unknown> = {};

    // --- nationalId duplicate check (must run before mutation) ---
    if (hasOwn(payload, "nationalId")) {
      const nextNationalId = payload.nationalId || null;
      const currentNationalId = domainClient.nationalId?.value ?? null;
      if (nextNationalId !== currentNationalId) {
        if (await hasDuplicateNationalId(get, nextNationalId, clientId)) {
          return { status: 409, body: { message: "A client with this national ID already exists" } };
        }
        changedFields.nationalId = nextNationalId;
      }
    }

    // --- build profile-update patch ---
    const profileUpdate: {
      fullName?: string;
      phone?: PhoneNumber | null;
      nationalId?: NationalId | null;
      kraPin?: string | null;
      photoUrl?: string | null;
      idDocumentUrl?: string | null;
      nextOfKinName?: string | null;
      nextOfKinPhone?: string | null;
      nextOfKinRelation?: string | null;
      businessType?: string | null;
      businessYears?: number | null;
      businessLocation?: string | null;
      residentialAddress?: string | null;
      officerId?: number | null;
    } = {};

    if (typeof payload.fullName === "string" && payload.fullName !== domainClient.fullName) {
      profileUpdate.fullName = payload.fullName;
      changedFields.fullName = payload.fullName;
    }
    if (hasOwn(payload, "phone")) {
      const nextPhone = payload.phone
        ? (() => { try { return PhoneNumber.fromString(String(payload.phone)); } catch { return null; } })()
        : null;
      profileUpdate.phone = nextPhone;
      changedFields.phone = nextPhone?.value ?? null;
    }
    if (hasOwn(payload, "nationalId")) {
      const nextNationalId = payload.nationalId
        ? (() => { try { return NationalId.fromString(String(payload.nationalId)); } catch { return null; } })()
        : null;
      profileUpdate.nationalId = nextNationalId;
    }
    if (hasOwn(payload, "kraPin")) {
      profileUpdate.kraPin = payload.kraPin || null;
      changedFields.kraPin = payload.kraPin;
    }
    if (hasOwn(payload, "photoUrl")) {
      profileUpdate.photoUrl = payload.photoUrl || null;
      changedFields.photoUrl = payload.photoUrl;
    }
    if (hasOwn(payload, "idDocumentUrl")) {
      profileUpdate.idDocumentUrl = payload.idDocumentUrl || null;
      changedFields.idDocumentUrl = payload.idDocumentUrl;
    }
    if (hasOwn(payload, "nextOfKinName")) {
      profileUpdate.nextOfKinName = payload.nextOfKinName || null;
      changedFields.nextOfKinName = payload.nextOfKinName;
    }
    if (hasOwn(payload, "nextOfKinPhone")) {
      profileUpdate.nextOfKinPhone = payload.nextOfKinPhone || null;
      changedFields.nextOfKinPhone = payload.nextOfKinPhone;
    }
    if (hasOwn(payload, "nextOfKinRelation")) {
      profileUpdate.nextOfKinRelation = payload.nextOfKinRelation || null;
      changedFields.nextOfKinRelation = payload.nextOfKinRelation;
    }
    if (hasOwn(payload, "businessType")) {
      profileUpdate.businessType = payload.businessType || null;
      changedFields.businessType = payload.businessType;
    }
    if (hasOwn(payload, "businessYears")) {
      profileUpdate.businessYears = payload.businessYears || null;
      changedFields.businessYears = payload.businessYears;
    }
    if (hasOwn(payload, "businessLocation")) {
      profileUpdate.businessLocation = payload.businessLocation || null;
      changedFields.businessLocation = payload.businessLocation;
    }
    if (hasOwn(payload, "residentialAddress")) {
      profileUpdate.residentialAddress = payload.residentialAddress || null;
      changedFields.residentialAddress = payload.residentialAddress;
    }
    if (hasOwn(payload, "officerId")) {
      profileUpdate.officerId = payload.officerId || null;
      changedFields.officerId = payload.officerId;
    }

    // We now inline the domain entity recreation rather than PhoneNum imports (since this file will be cleaned further)
    // but we can at least avoid direct use for now and let the extracted function handle the next steps.

    // --- isActive  ->  deactivate / reactivate ---
    let activeChanged = false;
    if (hasOwn(payload, "isActive")) {
      const nextIsActive = Boolean(payload.isActive);
      if (nextIsActive !== domainClient.isActive) {
        if (nextIsActive) {
          domainClient.reactivate();
        } else {
          domainClient.deactivate();
        }
        changedFields.isActive = nextIsActive;
        activeChanged = true;
      }
    }

    const profileKeys = Object.keys(profileUpdate);
    if (profileKeys.length === 0 && !activeChanged && Object.keys(changedFields).length === 0) {
      return { status: 200, body: { message: "No client changes were applied", client: resolved.client } };
    }

    // Apply profile patch through the aggregate
    if (profileKeys.length > 0) {
      domainClient.updateProfile(profileUpdate);
    }

    // Persist via the repository (handles UPDATE vs INSERT internally)
    await clientRepository.save(domainClient);

    await writeAuditLog({
      userId: user.sub,
      action: "client.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify(changedFields),
      ipAddress,
    });
    await invalidateReportCaches();

    return { status: 200, body: { message: "Client updated", client: domainClient.toPersistence() } };
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
        ? Object.keys(exportRows[0]!)
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
    return portfolioService.listAssignableOfficers(user);
  }

  async function reallocatePortfolio(payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return portfolioService.reallocatePortfolio(payload, user, ipAddress);
  }

  async function getClientWithLoans(clientId: number, user: UserLike) {
    return portfolioService.getClientWithLoans(clientId, user);
  }

  async function addClientGuarantor(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return onboardingService.addClientGuarantor(clientId, payload, user, ipAddress);
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
    return onboardingService.updateClientGuarantor(clientId, guarantorId, payload, user, ipAddress);
  }

  async function addClientCollateral(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return onboardingService.addClientCollateral(clientId, payload, user, ipAddress);
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
    return onboardingService.updateClientCollateral(clientId, collateralId, payload, user, ipAddress);
  }

  async function recordClientFeePayment(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return onboardingService.recordClientFeePayment(clientId, payload, user, ipAddress);
  }

  async function getClientOnboardingStatus(clientId: number, user: UserLike) {
    return onboardingService.getClientOnboardingStatus(clientId, user);
  }

  async function getClientHistory(clientId: number, user: UserLike) {
    return portfolioService.getClientHistory(clientId, user);
  }

  async function syncClientOnboardingStatus(clientId: number) {
    return onboardingService.syncClientOnboardingStatus(clientId);
  }

  async function computeGraduatedLimitForClient(clientId: number) {
    // Note: User argument dropped as we bypass scope checks here; usually called internally with verified access
    // Or we update the service to accept it. In this case, we'll pass standard arg.
    const userMock = { sub: "system" };
    return portfolioService.computeGraduatedLimitForClient(clientId);
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
    syncClientOnboardingStatus,
    computeGraduatedLimitForClient,
  };
}

export {
  createClientRouteService,
};
