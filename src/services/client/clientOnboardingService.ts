import { Client } from "../../domain/client/entities/Client.js";
import { ClientId } from "../../domain/client/value-objects/ClientId.js";
import { KycStatus } from "../../domain/client/value-objects/KycStatus.js";
import { PhoneNumber } from "../../domain/client/value-objects/PhoneNumber.js";
import { NationalId } from "../../domain/client/value-objects/NationalId.js";
import {
  deriveOnboardingStatus,
  deriveOnboardingNextStep,
  hasDuplicateNationalId,
} from "./clientValidation.js";

type UserLike = Record<string, any>;
type DbRow = Record<string, any>;
type DbGetLike = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAllLike = (sql: string, params?: unknown[]) => Promise<DbRow[]>;
type DbRunLike = (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
type TxCallback = (tx: { get: DbGetLike; run: DbRunLike }) => Promise<unknown> | unknown;

export function createClientOnboardingService(deps: {
  get: DbGetLike;
  all: DbAllLike;
  run: DbRunLike;
  executeTransaction: (callback: TxCallback) => Promise<unknown>;
  hierarchyService: any;
  clientRepository: any;
  writeAuditLog: any;
  invalidateReportCaches: any;
  resolveClientScopeClient: (clientId: number, user: UserLike) => Promise<{ status: number; body?: any; scope?: any; client?: any }>;
  refreshLinkedLoanAssessmentsForGuarantor: (guarantorId: number) => Promise<void>;
  refreshLinkedLoanAssessmentsForCollateral: (collateralAssetId: number) => Promise<void>;
  hasOwn: (payload: Record<string, unknown> | null | undefined, key: string) => boolean;
}) {
  const {
    get,
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
  } = deps;

  async function loadClientOnboardingProgress(clientId: number) {
    const [guarantorCountRow, collateralCountRow, clientRow] = await Promise.all([
      get("SELECT COUNT(*) AS total FROM guarantors WHERE client_id = ? AND COALESCE(is_active, 1) = 1", [clientId]),
      get("SELECT COUNT(*) AS total FROM collateral_assets WHERE client_id = ? AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')", [clientId]),
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

  async function createClient(payload: Record<string, any>, user: UserLike, ipAddress: string) {
    if (await hasDuplicateNationalId(get, payload.nationalId || null)) {
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

    const safePhone = payload.phone
      ? (() => { try { return PhoneNumber.fromString(String(payload.phone)); } catch { return null; } })()
      : null;
    const safeNationalId = payload.nationalId
      ? (() => { try { return NationalId.fromString(String(payload.nationalId)); } catch { return null; } })()
      : null;

    const normalizedPhone = safePhone?.value ?? (payload.phone || null);
    const normalizedNationalId = safeNationalId?.value ?? (payload.nationalId || null);

    let newId: number;
    try {
      newId = (await executeTransaction(async (tx: any) => {
        const dup = await tx.get(
          `SELECT id FROM clients
           WHERE national_id IS NOT NULL
             AND LOWER(REPLACE(REPLACE(TRIM(national_id), ' ', ''), '-', '')) = ?`,
          [normalizedNationalId],
        );
        if (dup?.id) {
          throw Object.assign(new Error("duplicate_national_id"), { _isDuplicate: true });
        }

        const createdAt = new Date().toISOString();
        const insert = await tx.run(
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
            normalizedPhone,
            normalizedNationalId,
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
        return Number(insert.lastID);
      })) as number;
    } catch (err: any) {
      if (err?._isDuplicate) {
        return { status: 409, body: { message: "A client with this national ID already exists" } };
      }
      if (String(err?.message || "").toLowerCase().includes("unique")) {
        return { status: 409, body: { message: "A client with this national ID already exists" } };
      }
      throw err;
    }

    const _clientAggregate = Client.create({
      id: newId,
      fullName: payload.fullName,
      phone: safePhone,
      nationalId: safeNationalId,
      branchId: Number(branchId),
      officerId: selectedOfficerId,
      createdByUserId: Number(user.sub),
      kraPin: payload.kraPin || null,
      photoUrl: payload.photoUrl || null,
      idDocumentUrl: payload.idDocumentUrl || null,
      nextOfKinName: payload.nextOfKinName || null,
      nextOfKinPhone: payload.nextOfKinPhone || null,
      nextOfKinRelation: payload.nextOfKinRelation || null,
      businessType: payload.businessType || null,
      businessYears: payload.businessYears ?? null,
      businessLocation: payload.businessLocation || null,
      residentialAddress: payload.residentialAddress || null,
    });
    _clientAggregate.clearEvents();

    const client = await get("SELECT * FROM clients WHERE id = ?", [newId]);

    await writeAuditLog({
      userId: user.sub,
      action: "client.created",
      targetType: "client",
      targetId: newId,
      details: JSON.stringify({ fullName: payload.fullName, branchId, officerId: selectedOfficerId }),
      ipAddress,
    });
    await invalidateReportCaches();

    return { status: 201, body: client };
  }

  async function updateClientKyc(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const scope = await hierarchyService.resolveHierarchyScope(user);

    const domainClient = await clientRepository.findById(ClientId.fromNumber(clientId));
    if (!domainClient) {
      return { status: 404, body: { message: "Client not found" } };
    }
    if (!hierarchyService.isBranchInScope(scope, domainClient.branchId)) {
      return { status: 403, body: { message: "Forbidden: client is outside your scope" } };
    }

    const previousStatus = domainClient.kycStatus.value;
    if (previousStatus === payload.status) {
      const unchangedClient = await get("SELECT * FROM clients WHERE id = ?", [clientId]);
      return { status: 200, body: { message: "Client KYC status is unchanged", client: unchangedClient } };
    }

    const nextKycStatus = KycStatus.fromString(payload.status);
    domainClient.updateKycStatus(nextKycStatus, Number(user.sub), payload.note ?? null);
    await clientRepository.save(domainClient);
    domainClient.clearEvents();

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

    const domainClientForFee = await clientRepository.findById(ClientId.fromNumber(clientId));
    if (domainClientForFee) {
      domainClientForFee.recordFeePayment({
        amount: payload.amount ?? null,
        paymentReference: payload.paymentReference ?? null,
        paidAt: paidAtIso,
        recordedByUserId: Number(user.sub),
      });
      await clientRepository.save(domainClientForFee);
      domainClientForFee.clearEvents();
    } else {
      await run(
        `UPDATE clients SET fee_payment_status = 'paid', fees_paid_at = ?, updated_at = ? WHERE id = ?`,
        [paidAtIso, updatedAt, clientId],
      );
    }

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

  return {
    createClient,
    updateClientKyc,
    addClientGuarantor,
    updateClientGuarantor,
    addClientCollateral,
    updateClientCollateral,
    recordClientFeePayment,
    getClientOnboardingStatus,
    syncClientOnboardingStatus,
  };
}
