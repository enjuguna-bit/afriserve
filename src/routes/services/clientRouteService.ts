import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../../utils/http.js";
import type { ClientRouteDeps } from "../../types/routeDeps.js";
import type { AuthSessionUser } from "../../types/auth.js";
import { createLoanUnderwritingService } from "../../services/loanUnderwritingService.js";
import { ClientId } from "../../domain/client/value-objects/ClientId.js";
import { PhoneNumber } from "../../domain/client/value-objects/PhoneNumber.js";
import { normalizeKenyanPhone } from "../../utils/helpers.js";
import { NationalId } from "../../domain/client/value-objects/NationalId.js";
import {
  hasDuplicateNationalId,
} from "../../services/client/clientValidation.js";
import { createClientOnboardingService } from "../../services/client/clientOnboardingService.js";
import { createClientPortfolioService } from "../../services/client/clientPortfolioService.js";
import { createClientReadService } from "../../services/client/clientReadService.js";
import { createClientProfileRefreshService } from "../../services/clientProfileRefreshService.js";
import { getCurrentTenantId } from "../../utils/tenantStore.js";

type UserLike = AuthSessionUser & Record<string, unknown>;
type QueryLike = Record<string, any>;

function createClientRouteService(deps: ClientRouteDeps) {
  const {
    run,
    get,
    all,
    executeTransaction,
    writeAuditLog,
    hierarchyService,
    reportCache = null,
    serviceRegistry = null,
  } = deps;
  const loanUnderwritingService = createLoanUnderwritingService({ get, run });
  const sharedClientRepository = serviceRegistry?.client?.clientRepository;
  if (!sharedClientRepository) {
    throw new Error("Client routes require a shared serviceRegistry to avoid duplicate repository initialization.");
  }
  const clientRepository = sharedClientRepository;
  const clientReadService = createClientReadService({ all, get, hierarchyService });

  async function loadClientDetail(clientId: number) {
    return get(
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
        LEFT JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
        LEFT JOIN regions r ON r.id = b.region_id
        LEFT JOIN users officer ON officer.id = c.officer_id AND officer.tenant_id = c.tenant_id
        LEFT JOIN users creator ON creator.id = c.created_by_user_id AND creator.tenant_id = c.tenant_id
        WHERE c.id = ? AND c.tenant_id = ?
        LIMIT 1
      `,
      [clientId, getCurrentTenantId()],
    );
  }

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
    loadClientDetail,
    refreshLinkedLoanAssessmentsForGuarantor,
    refreshLinkedLoanAssessmentsForCollateral,
    hasOwn,
  });

  const profileRefreshService = createClientProfileRefreshService({
    get,
    all: all ?? (async () => []),
    run,
    executeTransaction,
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    resolveClientScopeClient,
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

  function isAdmin(user: Record<string, unknown> | null | undefined) {
    return String(user?.role || "").toLowerCase() === "admin"
      || (Array.isArray(user?.roles) && user.roles.some((role) => String(role || "").toLowerCase() === "admin"));
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
    const tenantId = getCurrentTenantId();
    const linkedLoans = await all(
      `
        SELECT DISTINCT loan_id
        FROM loan_guarantors
        WHERE guarantor_id = ?
          AND tenant_id = ?
      `,
      [guarantorId, tenantId],
    );

    await refreshLoanAssessments(linkedLoans.map((row) => Number(row.loan_id || 0)));
  }

  async function refreshLinkedLoanAssessmentsForCollateral(collateralAssetId: number) {
    const tenantId = getCurrentTenantId();
    const linkedLoans = await all(
      `
        SELECT DISTINCT loan_id
        FROM loan_collaterals
        WHERE collateral_asset_id = ?
          AND tenant_id = ?
      `,
      [collateralAssetId, tenantId],
    );

    await refreshLoanAssessments(linkedLoans.map((row) => Number(row.loan_id || 0)));
  }

  async function resolveClientScopeClient(clientId: number, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const client = await loadClientDetail(clientId);

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
    const piiOverrideReason = typeof payload.piiOverrideReason === "string"
      ? payload.piiOverrideReason.trim()
      : "";
    let piiFieldChanged = false;

    // --- nationalId duplicate check (must run before mutation) ---
    if (hasOwn(payload, "nationalId")) {
      const nextNationalId = payload.nationalId || null;
      const currentNationalId = domainClient.nationalId?.value ?? null;
      if (nextNationalId !== currentNationalId) {
        if (await hasDuplicateNationalId(get, nextNationalId, clientId)) {
          return { status: 409, body: { message: "A client with this national ID already exists" } };
        }
        changedFields.nationalId = nextNationalId;
        piiFieldChanged = true;
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
      latitude?: number | null;
      longitude?: number | null;
      locationAccuracyMeters?: number | null;
      locationCapturedAt?: Date | null;
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
      const currentPhone = domainClient.phone?.value ?? null;
      if ((nextPhone?.value ?? null) !== currentPhone) {
        piiFieldChanged = true;
      }
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
      profileUpdate.nextOfKinPhone = payload.nextOfKinPhone ? normalizeKenyanPhone(payload.nextOfKinPhone) : null;
      changedFields.nextOfKinPhone = profileUpdate.nextOfKinPhone;
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
    if (hasOwn(payload, "latitude")) {
      const nextLatitude = payload.latitude == null ? null : Number(payload.latitude);
      profileUpdate.latitude = nextLatitude;
      changedFields.latitude = nextLatitude;
    }
    if (hasOwn(payload, "longitude")) {
      const nextLongitude = payload.longitude == null ? null : Number(payload.longitude);
      profileUpdate.longitude = nextLongitude;
      changedFields.longitude = nextLongitude;
    }
    if (hasOwn(payload, "locationAccuracyMeters")) {
      const nextAccuracy = payload.locationAccuracyMeters == null ? null : Number(payload.locationAccuracyMeters);
      profileUpdate.locationAccuracyMeters = nextAccuracy;
      changedFields.locationAccuracyMeters = nextAccuracy;
    }
    if (hasOwn(payload, "locationCapturedAt")) {
      const nextCapturedAt = payload.locationCapturedAt ? new Date(String(payload.locationCapturedAt)) : null;
      profileUpdate.locationCapturedAt = nextCapturedAt;
      changedFields.locationCapturedAt = nextCapturedAt?.toISOString() ?? null;
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

    if (piiFieldChanged && !isAdmin(user)) {
      return { status: 403, body: { message: "Only admins can change phone number or national ID on the active profile" } };
    }
    if (piiFieldChanged && !piiOverrideReason) {
      return { status: 400, body: { message: "piiOverrideReason is required when changing phone number or national ID" } };
    }

    // Apply profile patch through the aggregate
    if (profileKeys.length > 0) {
      domainClient.updateProfile(profileUpdate);
    }

    // Persist via the repository (handles UPDATE vs INSERT internally)
    await clientRepository.save(domainClient);
    try {
      await onboardingService.syncClientOnboardingStatus(clientId);
    } catch {
      // Profile edits should still succeed if the derived onboarding refresh needs a later retry.
    }

    await writeAuditLog({
      userId: user.sub,
      action: "client.updated",
      targetType: "client",
      targetId: clientId,
      details: JSON.stringify({
        ...changedFields,
        piiOverrideReason: piiFieldChanged ? piiOverrideReason : null,
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    const updatedClient = await loadClientDetail(clientId);
    return { status: 200, body: { message: "Client updated", client: updatedClient ?? domainClient.toPersistence() } };
  }

  async function listClients(query: QueryLike, user: UserLike) {
    return clientReadService.listClients(query, user);
  }

  async function findPotentialDuplicates(payload: Record<string, any>, user: UserLike) {
    return clientReadService.findPotentialDuplicates(payload, user);
  }

  async function listAssignableOfficers(user: UserLike) {
    return portfolioService.listAssignableOfficers(user);
  }

  async function getCurrentClient(user: UserLike) {
    const tenantId = getCurrentTenantId();
    const userId = Number(user?.sub || 0);
    const normalizedRoles = [
      String(user?.role || "").trim().toLowerCase(),
      ...(Array.isArray(user?.roles) ? user.roles.map((role) => String(role || "").trim().toLowerCase()) : []),
    ].filter(Boolean);

    if (!normalizedRoles.includes("client")) {
      return { status: 403, body: { message: "Current client lookup is only available for borrower accounts" } };
    }

    if (!Number.isInteger(userId) || userId <= 0) {
      return { status: 401, body: { message: "Invalid authenticated user session" } };
    }

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
        LEFT JOIN branches b ON b.id = c.branch_id AND b.tenant_id = c.tenant_id
        LEFT JOIN regions r ON r.id = b.region_id
        LEFT JOIN users officer ON officer.id = c.officer_id AND officer.tenant_id = c.tenant_id
        LEFT JOIN users creator ON creator.id = c.created_by_user_id AND creator.tenant_id = c.tenant_id
        WHERE c.tenant_id = ?
          AND (
            c.created_by_user_id = ?
            OR c.officer_id = ?
          )
        ORDER BY
          CASE WHEN c.created_by_user_id = ? THEN 0 ELSE 1 END,
          datetime(c.created_at) DESC,
          c.id DESC
        LIMIT 1
      `,
      [tenantId, userId, userId, userId],
    );

    if (!client) {
      return { status: 404, body: { message: "No linked client profile was found for the current borrower account" } };
    }

    const loans = await all(
      `
        SELECT id, principal, interest_rate, term_months, term_weeks, registration_fee, processing_fee, expected_total, repaid_total, balance, status, disbursed_at, branch_id, created_at, approved_at, purpose, product_id
        FROM loans
        WHERE client_id = ? AND tenant_id = ?
        ORDER BY id DESC
      `,
      [Number(client.id), tenantId],
    );

    return {
      status: 200,
      body: {
        ...client,
        loans,
      },
    };
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
    const tenantId = getCurrentTenantId();
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const guarantors = await all(
      `
        SELECT *
        FROM guarantors
        WHERE client_id = ?
          AND tenant_id = ?
          AND COALESCE(is_active, 1) = 1
        ORDER BY id DESC
      `,
      [clientId, tenantId],
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
    const tenantId = getCurrentTenantId();
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200) {
      return { status: resolved.status, body: resolved.body };
    }

    const collaterals = await all(
      `
        SELECT *
        FROM collateral_assets
        WHERE client_id = ?
          AND tenant_id = ?
          AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')
        ORDER BY id DESC
      `,
      [clientId, tenantId],
    );

    return {
      status: 200,
      body: collaterals.map((collateral) => ({
        ...collateral,
        image_urls: (() => {
          try {
            const parsed = JSON.parse(String(collateral.image_urls_json || "[]"));
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return collateral.document_url ? [collateral.document_url] : [];
          }
        })(),
      })),
    };
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
    const history = await portfolioService.getClientHistory(clientId, user);
    if (history.status !== 200) {
      return history;
    }

    const augmentation = await profileRefreshService.buildHistoryAugmentation(clientId, user);
    return {
      status: 200,
      body: {
        ...history.body,
        ...(augmentation || {}),
      },
    };
  }

  async function createProfileRefresh(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return profileRefreshService.createProfileRefresh(clientId, payload, user, ipAddress);
  }

  async function getProfileRefresh(refreshId: number, user: UserLike) {
    return profileRefreshService.getProfileRefresh(refreshId, user);
  }

  async function updateProfileRefreshDraft(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return profileRefreshService.updateProfileRefreshDraft(refreshId, payload, user, ipAddress);
  }

  async function submitProfileRefresh(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return profileRefreshService.submitProfileRefresh(refreshId, payload, user, ipAddress);
  }

  async function reviewProfileRefresh(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    return profileRefreshService.reviewProfileRefresh(refreshId, payload, user, ipAddress);
  }

  async function listProfileRefreshes(query: QueryLike, user: UserLike) {
    return profileRefreshService.listRefreshes(query, user);
  }

  async function listProfileVersions(clientId: number, user: UserLike) {
    return profileRefreshService.listProfileVersions(clientId, user);
  }

  async function getProfileVersion(clientId: number, versionId: number, user: UserLike) {
    return profileRefreshService.getProfileVersion(clientId, versionId, user);
  }

  async function syncClientOnboardingStatus(clientId: number) {
    return onboardingService.syncClientOnboardingStatus(clientId);
  }

  async function computeGraduatedLimitForClient(clientId: number) {
    return portfolioService.computeGraduatedLimitForClient(clientId);
  }

  return {
    createClient,
    updateClientKyc,
    updateClient,
    listClients,
    findPotentialDuplicates,
    listAssignableOfficers,
    getCurrentClient,
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
    createProfileRefresh,
    getProfileRefresh,
    updateProfileRefreshDraft,
    submitProfileRefresh,
    reviewProfileRefresh,
    listProfileRefreshes,
    listProfileVersions,
    getProfileVersion,
    syncClientOnboardingStatus,
    computeGraduatedLimitForClient,
  };
}

export {
  createClientRouteService,
};

