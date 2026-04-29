import crypto from "node:crypto";
import { normalizeKenyanPhone } from "../utils/helpers.js";
import type { AuthSessionUser } from "../types/auth.js";
import type { HierarchyServiceLike } from "../types/serviceContracts.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type UserLike = AuthSessionUser & Record<string, unknown>;
type DbRow = Record<string, any>;
type DbGetLike = (sql: string, params?: unknown[]) => Promise<DbRow | null | undefined>;
type DbAllLike = (sql: string, params?: unknown[]) => Promise<DbRow[]>;
type DbRunLike = (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number }>;
type TxContext = {
  get: DbGetLike;
  all: DbAllLike;
  run: DbRunLike;
};

type ProfileSnapshot = {
  profile: {
    identity: {
      fullName: string;
      phone: string | null;
      nationalId: string | null;
      kraPin: string | null;
    };
    nextOfKin: {
      name: string | null;
      phone: string | null;
      relation: string | null;
    };
    business: {
      type: string | null;
      years: number | null;
      location: string | null;
      residentialAddress: string | null;
    };
    gps: {
      latitude: number | null;
      longitude: number | null;
      accuracyMeters: number | null;
      capturedAt: string | null;
    };
    photo: {
      url: string | null;
      capturedAt: string | null;
      gpsLatitude: number | null;
      gpsLongitude: number | null;
      gpsAccuracyMeters: number | null;
    };
    documents: {
      idDocumentUrl: string | null;
    };
    assignment: {
      officerId: number | null;
      branchId: number | null;
    };
  };
  guarantors: Array<Record<string, any>>;
  collaterals: Array<Record<string, any>>;
};

type RefreshChange = {
  path: string;
  previousValue: unknown;
  nextValue: unknown;
};

const PROFILE_REFRESH_REVIEWERS = new Set(["admin", "operations_manager"]);
const LOCKED_PII_SECTIONS = new Set(["profile.identity.phone", "profile.identity.nationalId"]);

function createClientProfileRefreshService(deps: {
  get: DbGetLike;
  all: DbAllLike;
  run: DbRunLike;
  executeTransaction: (callback: (tx: TxContext) => Promise<unknown> | unknown) => Promise<unknown>;
  hierarchyService: HierarchyServiceLike;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  invalidateReportCaches: () => Promise<void>;
  resolveClientScopeClient: (clientId: number, user: UserLike) => Promise<{ status: number; body?: any; client?: any }>;
}) {
  const {
    get,
    all,
    executeTransaction,
    hierarchyService,
    writeAuditLog,
    invalidateReportCaches,
    resolveClientScopeClient,
  } = deps;

  function nowIso() {
    return new Date().toISOString();
  }

  function getTenantId() {
    return getCurrentTenantId();
  }

  function parseJson<T>(value: unknown, fallback: T): T {
    if (typeof value !== "string" || !value.trim()) {
      return fallback;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function normalizeNullableString(value: unknown): string | null {
    if (value == null) {
      return null;
    }
    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }

  function normalizeNullablePhone(value: unknown): string | null {
    if (value == null || value === "") {
      return null;
    }
    return normalizeKenyanPhone(String(value));
  }

  function normalizeNullableNumber(value: unknown): number | null {
    if (value == null || value === "") {
      return null;
    }
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : null;
  }

  function normalizeNullableInteger(value: unknown): number | null {
    const numericValue = normalizeNullableNumber(value);
    if (numericValue == null) {
      return null;
    }
    return Number.isInteger(numericValue) ? numericValue : null;
  }

  function getUserRoles(user: UserLike | null | undefined): string[] {
    const roles = Array.isArray(user?.roles) && user.roles.length > 0
      ? user.roles
      : [user?.role];
    return roles
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean);
  }

  function hasRole(user: UserLike | null | undefined, role: string) {
    return getUserRoles(user).includes(String(role || "").trim().toLowerCase());
  }

  function isAdmin(user: UserLike | null | undefined) {
    return hasRole(user, "admin");
  }

  function isLoanOfficer(user: UserLike | null | undefined) {
    return hasRole(user, "loan_officer");
  }

  function isReviewer(user: UserLike | null | undefined) {
    return getUserRoles(user).some((role) => PROFILE_REFRESH_REVIEWERS.has(role));
  }

  function isProfileRefreshSchemaUnavailable(error: unknown) {
    const errorMessage = String((error as { message?: unknown })?.message || error || "").toLowerCase();
    return (
      /no such table|relation .* does not exist|no such column|column .* does not exist|unknown column/.test(errorMessage)
      && (
        errorMessage.includes("client_profile_versions")
        || errorMessage.includes("client_profile_refreshes")
        || errorMessage.includes("approved_version_id")
        || errorMessage.includes("pushback_count")
        || errorMessage.includes("priority_status")
      )
    );
  }

  function createDefaultSnapshot(): ProfileSnapshot {
    return {
      profile: {
        identity: {
          fullName: "",
          phone: null,
          nationalId: null,
          kraPin: null,
        },
        nextOfKin: {
          name: null,
          phone: null,
          relation: null,
        },
        business: {
          type: null,
          years: null,
          location: null,
          residentialAddress: null,
        },
        gps: {
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          capturedAt: null,
        },
        photo: {
          url: null,
          capturedAt: null,
          gpsLatitude: null,
          gpsLongitude: null,
          gpsAccuracyMeters: null,
        },
        documents: {
          idDocumentUrl: null,
        },
        assignment: {
          officerId: null,
          branchId: null,
        },
      },
      guarantors: [],
      collaterals: [],
    };
  }

  function normalizeStoredGuarantor(item: Record<string, any>, index: number): Record<string, any> {
    const sourceGuarantorId = normalizeNullableInteger(item.sourceGuarantorId);
    return {
      draftItemId: normalizeNullableString(item.draftItemId) || (sourceGuarantorId ? `g-${sourceGuarantorId}` : `g-${index + 1}`),
      sourceGuarantorId,
      fullName: String(item.fullName || "").trim(),
      phone: normalizeNullablePhone(item.phone),
      nationalId: normalizeNullableString(item.nationalId),
      physicalAddress: normalizeNullableString(item.physicalAddress),
      occupation: normalizeNullableString(item.occupation),
      employerName: normalizeNullableString(item.employerName),
      monthlyIncome: normalizeNullableNumber(item.monthlyIncome),
      guaranteeAmount: normalizeNullableNumber(item.guaranteeAmount),
      idDocumentUrl: normalizeNullableString(item.idDocumentUrl),
    };
  }

  function normalizeStoredCollateral(item: Record<string, any>, index: number): Record<string, any> {
    const sourceCollateralId = normalizeNullableInteger(item.sourceCollateralId);
    return {
      draftItemId: normalizeNullableString(item.draftItemId) || (sourceCollateralId ? `c-${sourceCollateralId}` : `c-${index + 1}`),
      sourceCollateralId,
      assetType: String(item.assetType || "").trim(),
      description: String(item.description || "").trim(),
      estimatedValue: normalizeNullableNumber(item.estimatedValue) ?? 0,
      ownershipType: normalizeNullableString(item.ownershipType) || "client",
      ownerName: normalizeNullableString(item.ownerName),
      ownerNationalId: normalizeNullableString(item.ownerNationalId),
      registrationNumber: normalizeNullableString(item.registrationNumber),
      logbookNumber: normalizeNullableString(item.logbookNumber),
      titleNumber: normalizeNullableString(item.titleNumber),
      locationDetails: normalizeNullableString(item.locationDetails),
      valuationDate: normalizeNullableString(item.valuationDate),
      documentUrl: normalizeNullableString(item.documentUrl),
      imageUrls: Array.isArray(item.imageUrls)
        ? item.imageUrls.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    };
  }

  function normalizeSnapshot(snapshot: Record<string, any> | null | undefined): ProfileSnapshot {
    const base = createDefaultSnapshot();
    const identity = snapshot?.profile?.identity || {};
    const nextOfKin = snapshot?.profile?.nextOfKin || {};
    const business = snapshot?.profile?.business || {};
    const gps = snapshot?.profile?.gps || {};
    const photo = snapshot?.profile?.photo || {};
    const documents = snapshot?.profile?.documents || {};
    const assignment = snapshot?.profile?.assignment || {};

    return {
      profile: {
        identity: {
          fullName: String(identity.fullName || base.profile.identity.fullName).trim(),
          phone: normalizeNullablePhone(identity.phone),
          nationalId: normalizeNullableString(identity.nationalId),
          kraPin: normalizeNullableString(identity.kraPin),
        },
        nextOfKin: {
          name: normalizeNullableString(nextOfKin.name),
          phone: normalizeNullablePhone(nextOfKin.phone),
          relation: normalizeNullableString(nextOfKin.relation),
        },
        business: {
          type: normalizeNullableString(business.type),
          years: normalizeNullableInteger(business.years),
          location: normalizeNullableString(business.location),
          residentialAddress: normalizeNullableString(business.residentialAddress),
        },
        gps: {
          latitude: normalizeNullableNumber(gps.latitude),
          longitude: normalizeNullableNumber(gps.longitude),
          accuracyMeters: normalizeNullableNumber(gps.accuracyMeters),
          capturedAt: normalizeNullableString(gps.capturedAt),
        },
        photo: {
          url: normalizeNullableString(photo.url),
          capturedAt: normalizeNullableString(photo.capturedAt),
          gpsLatitude: normalizeNullableNumber(photo.gpsLatitude),
          gpsLongitude: normalizeNullableNumber(photo.gpsLongitude),
          gpsAccuracyMeters: normalizeNullableNumber(photo.gpsAccuracyMeters),
        },
        documents: {
          idDocumentUrl: normalizeNullableString(documents.idDocumentUrl),
        },
        assignment: {
          officerId: normalizeNullableInteger(assignment.officerId),
          branchId: normalizeNullableInteger(assignment.branchId),
        },
      },
      guarantors: Array.isArray(snapshot?.guarantors)
        ? snapshot!.guarantors.map((item: Record<string, any>, index: number) => normalizeStoredGuarantor(item, index))
        : [],
      collaterals: Array.isArray(snapshot?.collaterals)
        ? snapshot!.collaterals.map((item: Record<string, any>, index: number) => normalizeStoredCollateral(item, index))
        : [],
    };
  }

  function stableSnapshotJson(snapshot: ProfileSnapshot) {
    return JSON.stringify(normalizeSnapshot(snapshot));
  }

  function prepareIncomingGuarantors(items: Record<string, any>[]): Record<string, any>[] {
    return items.map((item, index) => {
      const normalized = normalizeStoredGuarantor(item, index);
      return {
        ...normalized,
        draftItemId: normalized.draftItemId || (normalized.sourceGuarantorId ? `g-${normalized.sourceGuarantorId}` : `g-${crypto.randomUUID()}`),
      };
    });
  }

  function prepareIncomingCollaterals(items: Record<string, any>[]): Record<string, any>[] {
    return items.map((item, index) => {
      const normalized = normalizeStoredCollateral(item, index);
      return {
        ...normalized,
        draftItemId: normalized.draftItemId || (normalized.sourceCollateralId ? `c-${normalized.sourceCollateralId}` : `c-${crypto.randomUUID()}`),
      };
    });
  }

  function parseStoredSnapshot(rawSnapshot: unknown): ProfileSnapshot {
    return normalizeSnapshot(parseJson<Record<string, any>>(rawSnapshot, createDefaultSnapshot()));
  }

  function normalizeFeedbackFieldPaths(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  }

  function toSectionPath(path: string): string {
    if (path.startsWith("profile.photo")) return "profile.photo";
    if (path.startsWith("profile.gps")) return "profile.gps";
    if (path.startsWith("profile.identity.phone")) return "profile.identity.phone";
    if (path.startsWith("profile.identity.nationalId")) return "profile.identity.nationalId";
    if (path.startsWith("profile.identity.fullName")) return "profile.identity.fullName";
    if (path.startsWith("profile.identity.kraPin")) return "profile.identity.kraPin";
    if (path.startsWith("profile.nextOfKin")) return "profile.nextOfKin";
    if (path.startsWith("profile.business")) return "profile.business";
    if (path.startsWith("guarantors")) return "guarantors";
    if (path.startsWith("collaterals")) return "collaterals";
    return path;
  }

  function collectSnapshotChanges(previousValue: unknown, nextValue: unknown, basePath = ""): RefreshChange[] {
    if (Array.isArray(previousValue) && Array.isArray(nextValue)) {
      const previousIsKeyed = previousValue.every(
        (entry) => entry && typeof entry === "object" && typeof entry.draftItemId === "string",
      );
      const nextIsKeyed = nextValue.every(
        (entry) => entry && typeof entry === "object" && typeof entry.draftItemId === "string",
      );

      if (previousIsKeyed && nextIsKeyed) {
        const previousById = new Map(previousValue.map((entry: any) => [String(entry.draftItemId), entry]));
        const nextById = new Map(nextValue.map((entry: any) => [String(entry.draftItemId), entry]));
        const keys = [...new Set([...previousById.keys(), ...nextById.keys()])].sort((left, right) => left.localeCompare(right));
        return keys.flatMap((key) => {
          const leftValue = previousById.get(key);
          const rightValue = nextById.get(key);
          if (!leftValue || !rightValue) {
            return [{
              path: `${basePath}[${key}]`,
              previousValue: leftValue ?? null,
              nextValue: rightValue ?? null,
            }];
          }
          return collectSnapshotChanges(leftValue, rightValue, `${basePath}[${key}]`);
        });
      }

      if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
        return [{
          path: basePath,
          previousValue,
          nextValue,
        }];
      }
      return [];
    }

    const previousIsObject = previousValue && typeof previousValue === "object" && !Array.isArray(previousValue);
    const nextIsObject = nextValue && typeof nextValue === "object" && !Array.isArray(nextValue);
    if (previousIsObject && nextIsObject) {
      const keys = [...new Set([
        ...Object.keys(previousValue as Record<string, unknown>),
        ...Object.keys(nextValue as Record<string, unknown>),
      ])].sort((left, right) => left.localeCompare(right));

      return keys.flatMap((key) => {
        const childPath = basePath ? `${basePath}.${key}` : key;
        return collectSnapshotChanges(
          (previousValue as Record<string, unknown>)[key],
          (nextValue as Record<string, unknown>)[key],
          childPath,
        );
      });
    }

    if (JSON.stringify(previousValue ?? null) !== JSON.stringify(nextValue ?? null)) {
      return [{
        path: basePath,
        previousValue: previousValue ?? null,
        nextValue: nextValue ?? null,
      }];
    }

    return [];
  }

  function buildEventGps(payload: Record<string, any>, snapshot: ProfileSnapshot) {
    if (payload.photo && typeof payload.photo === "object") {
      return {
        gpsLatitude: normalizeNullableNumber(payload.photo.gpsLatitude),
        gpsLongitude: normalizeNullableNumber(payload.photo.gpsLongitude),
        gpsAccuracyMeters: normalizeNullableNumber(payload.photo.gpsAccuracyMeters),
        capturedAt: normalizeNullableString(payload.photo.capturedAt),
      };
    }
    if (payload.gps && typeof payload.gps === "object") {
      return {
        gpsLatitude: normalizeNullableNumber(payload.gps.latitude),
        gpsLongitude: normalizeNullableNumber(payload.gps.longitude),
        gpsAccuracyMeters: normalizeNullableNumber(payload.gps.accuracyMeters),
        capturedAt: normalizeNullableString(payload.gps.capturedAt),
      };
    }
    return {
      gpsLatitude: snapshot.profile.gps.latitude,
      gpsLongitude: snapshot.profile.gps.longitude,
      gpsAccuracyMeters: snapshot.profile.gps.accuracyMeters,
      capturedAt: snapshot.profile.gps.capturedAt,
    };
  }

  function normalizeActiveGuarantorForComparison(row: Record<string, any>) {
    return normalizeStoredGuarantor({
      draftItemId: `g-${Number(row.id || 0)}`,
      sourceGuarantorId: Number(row.id || 0),
      fullName: row.full_name,
      phone: row.phone,
      nationalId: row.national_id,
      physicalAddress: row.physical_address,
      occupation: row.occupation,
      employerName: row.employer_name,
      monthlyIncome: row.monthly_income,
      guaranteeAmount: row.guarantee_amount,
      idDocumentUrl: row.id_document_url,
    }, 0);
  }

  function normalizeActiveCollateralForComparison(row: Record<string, any>) {
    return normalizeStoredCollateral({
      draftItemId: `c-${Number(row.id || 0)}`,
      sourceCollateralId: Number(row.id || 0),
      assetType: row.asset_type,
      description: row.description,
      estimatedValue: row.estimated_value,
      ownershipType: row.ownership_type,
      ownerName: row.owner_name,
      ownerNationalId: row.owner_national_id,
      registrationNumber: row.registration_number,
      logbookNumber: row.logbook_number,
      titleNumber: row.title_number,
      locationDetails: row.location_details,
      valuationDate: row.valuation_date,
      documentUrl: row.document_url,
      imageUrls: parseJson<string[]>(row.image_urls_json, []),
    }, 0);
  }

  async function buildActiveSnapshot(queryApi: Pick<TxContext, "get" | "all">, clientId: number): Promise<ProfileSnapshot | null> {
    const tenantId = getTenantId();
    const client = await queryApi.get(
      `
        SELECT *
        FROM clients
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `,
      [clientId, tenantId],
    );

    if (!client) {
      return null;
    }

    const [guarantors, collaterals] = await Promise.all([
      queryApi.all(
        `
          SELECT *
          FROM guarantors
          WHERE client_id = ? AND tenant_id = ? AND COALESCE(is_active, 1) = 1
          ORDER BY id ASC
        `,
        [clientId, tenantId],
      ),
      queryApi.all(
        `
          SELECT *
          FROM collateral_assets
          WHERE client_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')
          ORDER BY id ASC
        `,
        [clientId, tenantId],
      ),
    ]);

    const photoMetadata = parseJson<Record<string, any>>(client.photo_metadata_json, {});

    return normalizeSnapshot({
      profile: {
        identity: {
          fullName: client.full_name,
          phone: client.phone,
          nationalId: client.national_id,
          kraPin: client.kra_pin,
        },
        nextOfKin: {
          name: client.next_of_kin_name,
          phone: client.next_of_kin_phone,
          relation: client.next_of_kin_relation,
        },
        business: {
          type: client.business_type,
          years: client.business_years,
          location: client.business_location,
          residentialAddress: client.residential_address,
        },
        gps: {
          latitude: client.latitude,
          longitude: client.longitude,
          accuracyMeters: client.location_accuracy_meters,
          capturedAt: client.location_captured_at,
        },
        photo: {
          url: client.photo_url,
          capturedAt: photoMetadata.capturedAt,
          gpsLatitude: photoMetadata.gpsLatitude,
          gpsLongitude: photoMetadata.gpsLongitude,
          gpsAccuracyMeters: photoMetadata.gpsAccuracyMeters,
        },
        documents: {
          idDocumentUrl: client.id_document_url,
        },
        assignment: {
          officerId: client.officer_id,
          branchId: client.branch_id,
        },
      },
      guarantors: guarantors.map((row, index) => normalizeStoredGuarantor({
        draftItemId: `g-${Number(row.id || index + 1)}`,
        sourceGuarantorId: Number(row.id || 0),
        fullName: row.full_name,
        phone: row.phone,
        nationalId: row.national_id,
        physicalAddress: row.physical_address,
        occupation: row.occupation,
        employerName: row.employer_name,
        monthlyIncome: row.monthly_income,
        guaranteeAmount: row.guarantee_amount,
        idDocumentUrl: row.id_document_url,
      }, index)),
      collaterals: collaterals.map((row, index) => normalizeStoredCollateral({
        draftItemId: `c-${Number(row.id || index + 1)}`,
        sourceCollateralId: Number(row.id || 0),
        assetType: row.asset_type,
        description: row.description,
        estimatedValue: row.estimated_value,
        ownershipType: row.ownership_type,
        ownerName: row.owner_name,
        ownerNationalId: row.owner_national_id,
        registrationNumber: row.registration_number,
        logbookNumber: row.logbook_number,
        titleNumber: row.title_number,
        locationDetails: row.location_details,
        valuationDate: row.valuation_date,
        documentUrl: row.document_url,
        imageUrls: parseJson<string[]>(row.image_urls_json, row.document_url ? [String(row.document_url)] : []),
      }, index)),
    });
  }

  async function ensureCurrentProfileVersion(queryApi: Pick<TxContext, "get" | "all" | "run">, clientId: number, actorUserId: number | null, note = "Baseline active profile snapshot") {
    const tenantId = getTenantId();
    const snapshot = await buildActiveSnapshot(queryApi, clientId);
    if (!snapshot) {
      return null;
    }

    const latestVersion = await queryApi.get(
      `
        SELECT *
        FROM client_profile_versions
        WHERE client_id = ? AND tenant_id = ?
        ORDER BY version_number DESC
        LIMIT 1
      `,
      [clientId, tenantId],
    );

    const snapshotJson = stableSnapshotJson(snapshot);
    if (latestVersion && String(latestVersion.snapshot_json || "") === snapshotJson) {
      return {
        row: latestVersion,
        snapshot,
      };
    }

    const createdAt = nowIso();
    const nextVersionNumber = Number(latestVersion?.version_number || 0) + 1;
    const insertResult = await queryApi.run(
      `
        INSERT INTO client_profile_versions (
          tenant_id,
          client_id,
          version_number,
          based_on_refresh_id,
          snapshot_json,
          note,
          created_by_user_id,
          approved_by_user_id,
          effective_from,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        tenantId,
        clientId,
        nextVersionNumber,
        null,
        snapshotJson,
        note,
        actorUserId,
        null,
        createdAt,
        createdAt,
      ],
    );

    const createdRow = await queryApi.get(
      `SELECT * FROM client_profile_versions WHERE id = ? LIMIT 1`,
      [insertResult.lastID],
    );

    return {
      row: createdRow,
      snapshot,
    };
  }

  async function resolveAssignee(client: Record<string, any>, payload: Record<string, any>, user: UserLike) {
    const tenantId = getTenantId();
    const explicitAssigneeId = normalizeNullableInteger(payload.assignedToUserId);
    const fallbackAssigneeId = explicitAssigneeId
      || normalizeNullableInteger(client.officer_id)
      || (isLoanOfficer(user) ? normalizeNullableInteger(user.sub) : null);

    if (!fallbackAssigneeId) {
      return { status: 400 as const, body: { message: "Assign the refresh to an active loan officer before starting it" } };
    }

    const assignee = await get(
      `
        SELECT id, role, is_active, branch_id, tenant_id
        FROM users
        WHERE id = ? AND tenant_id = ?
        LIMIT 1
      `,
      [fallbackAssigneeId, tenantId],
    );

    if (!assignee) {
      return { status: 400 as const, body: { message: "Assigned loan officer was not found" } };
    }
    if (String(assignee.role || "").trim().toLowerCase() !== "loan_officer") {
      return { status: 400 as const, body: { message: "Assigned user must be a loan officer" } };
    }
    if (Number(assignee.is_active || 0) !== 1) {
      return { status: 400 as const, body: { message: "Assigned loan officer is inactive" } };
    }
    if (normalizeNullableInteger(assignee.branch_id) !== normalizeNullableInteger(client.branch_id)) {
      return { status: 400 as const, body: { message: "Assigned loan officer must belong to the client's branch" } };
    }

    return { status: 200 as const, assigneeId: Number(assignee.id) };
  }

  function canEditRefresh(user: UserLike, refreshRow: Record<string, any>) {
    if (isAdmin(user)) {
      return true;
    }

    if (!isLoanOfficer(user)) {
      return false;
    }

    const userId = normalizeNullableInteger(user.sub);
    if (!userId) {
      return false;
    }

    return userId === normalizeNullableInteger(refreshRow.assigned_to_user_id)
      || userId === normalizeNullableInteger(refreshRow.requested_by_user_id);
  }

  function canReadRefresh(user: UserLike, refreshRow: Record<string, any>) {
    if (isAdmin(user) || isReviewer(user)) {
      return true;
    }
    return canEditRefresh(user, refreshRow);
  }

  async function loadRefresh(refreshId: number) {
    const tenantId = getTenantId();
    return get(
      `
        SELECT
          r.*,
          c.branch_id AS client_branch_id,
          c.officer_id AS client_officer_id,
          c.full_name AS client_name,
          b.name AS branch_name,
          requester.full_name AS requested_by_name,
          assignee.full_name AS assigned_to_name,
          reviewer.full_name AS reviewed_by_name
        FROM client_profile_refreshes r
        INNER JOIN clients c ON c.id = r.client_id
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN users requester ON requester.id = r.requested_by_user_id
        LEFT JOIN users assignee ON assignee.id = r.assigned_to_user_id
        LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id
        WHERE r.id = ? AND r.tenant_id = ?
        LIMIT 1
      `,
      [refreshId, tenantId],
    );
  }

  async function resolveRefreshScope(refreshId: number, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const refreshRow = await loadRefresh(refreshId);

    if (!refreshRow) {
      return { status: 404 as const, body: { message: "Profile refresh not found" } };
    }

    if (!hierarchyService.isBranchInScope(scope, refreshRow.client_branch_id)) {
      return { status: 403 as const, body: { message: "Forbidden: client is outside your scope" } };
    }

    if (!canReadRefresh(user, refreshRow)) {
      return { status: 403 as const, body: { message: "Forbidden: profile refresh is outside your assignment" } };
    }

    return { status: 200 as const, refreshRow };
  }

  async function loadOpenFeedback(refreshId: number) {
    const tenantId = getTenantId();
    return all(
      `
        SELECT
          f.*,
          flagged_by.full_name AS flagged_by_name,
          resolved_by.full_name AS resolved_by_name
        FROM client_profile_refresh_feedback f
        LEFT JOIN users flagged_by ON flagged_by.id = f.flagged_by_user_id
        LEFT JOIN users resolved_by ON resolved_by.id = f.resolved_by_user_id
        WHERE f.refresh_id = ? AND f.tenant_id = ? AND LOWER(COALESCE(f.status, 'open')) = 'open'
        ORDER BY f.flagged_at ASC, f.id ASC
      `,
      [refreshId, tenantId],
    );
  }

  async function loadRecentEvents(refreshId: number) {
    const tenantId = getTenantId();
    return all(
      `
        SELECT
          e.*,
          actor.full_name AS actor_name
        FROM client_profile_refresh_events e
        LEFT JOIN users actor ON actor.id = e.actor_user_id
        WHERE e.refresh_id = ? AND e.tenant_id = ?
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT 200
      `,
      [refreshId, tenantId],
    );
  }

  function serializeRefreshRow(refreshRow: Record<string, any>, feedbackRows: Record<string, any>[], eventRows: Record<string, any>[]) {
    return {
      id: Number(refreshRow.id),
      clientId: Number(refreshRow.client_id),
      clientName: refreshRow.client_name || null,
      branchName: refreshRow.branch_name || null,
      status: String(refreshRow.status || "draft").toLowerCase(),
      priorityStatus: String(refreshRow.priority_status || "normal").toLowerCase(),
      basedOnVersionId: normalizeNullableInteger(refreshRow.based_on_version_id),
      basedOnVersionNumber: normalizeNullableInteger(refreshRow.based_on_version_number),
      approvedVersionId: normalizeNullableInteger(refreshRow.approved_version_id),
      requestedByUserId: normalizeNullableInteger(refreshRow.requested_by_user_id),
      requestedByName: refreshRow.requested_by_name || null,
      assignedToUserId: normalizeNullableInteger(refreshRow.assigned_to_user_id),
      assignedToName: refreshRow.assigned_to_name || null,
      reviewedByUserId: normalizeNullableInteger(refreshRow.reviewed_by_user_id),
      reviewedByName: refreshRow.reviewed_by_name || null,
      requestedAt: refreshRow.requested_at || null,
      submittedAt: refreshRow.submitted_at || null,
      reviewedAt: refreshRow.reviewed_at || null,
      approvedAt: refreshRow.approved_at || null,
      pushbackCount: Number(refreshRow.pushback_count || 0),
      lockedFields: normalizeFeedbackFieldPaths(parseJson<unknown[]>(refreshRow.locked_fields_json, [])),
      editableFields: normalizeFeedbackFieldPaths(parseJson<unknown[]>(refreshRow.editable_fields_json, [])),
      requestedNote: normalizeNullableString(refreshRow.requested_note),
      submissionNote: normalizeNullableString(refreshRow.submission_note),
      reviewNote: normalizeNullableString(refreshRow.review_note),
      activeSnapshot: parseStoredSnapshot(refreshRow.active_snapshot_json),
      draftSnapshot: parseStoredSnapshot(refreshRow.draft_snapshot_json),
      openFeedback: feedbackRows.map((row) => ({
        id: Number(row.id),
        fieldPath: String(row.field_path || "").trim(),
        reasonCode: normalizeNullableString(row.reason_code),
        comment: normalizeNullableString(row.comment),
        flaggedByUserId: normalizeNullableInteger(row.flagged_by_user_id),
        flaggedByName: row.flagged_by_name || null,
        flaggedAt: row.flagged_at || null,
      })),
      recentEvents: eventRows.map((row) => ({
        id: Number(row.id),
        eventType: String(row.event_type || "").trim(),
        fieldPath: normalizeNullableString(row.field_path),
        actorUserId: normalizeNullableInteger(row.actor_user_id),
        actorName: row.actor_name || null,
        previousValue: parseJson<unknown>(row.previous_value_json, row.previous_value_json || null),
        nextValue: parseJson<unknown>(row.next_value_json, row.next_value_json || null),
        reason: normalizeNullableString(row.reason),
        gpsLatitude: normalizeNullableNumber(row.gps_latitude),
        gpsLongitude: normalizeNullableNumber(row.gps_longitude),
        gpsAccuracyMeters: normalizeNullableNumber(row.gps_accuracy_meters),
        deviceCapturedAt: row.device_captured_at || null,
        metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null),
        createdAt: row.created_at || null,
      })),
    };
  }

  function prepareDraftSnapshot(previousSnapshot: ProfileSnapshot, payload: Record<string, any>): ProfileSnapshot {
    const nextSnapshot = clone(previousSnapshot);

    if (Object.prototype.hasOwnProperty.call(payload, "fullName")) {
      nextSnapshot.profile.identity.fullName = String(payload.fullName || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
      nextSnapshot.profile.identity.phone = normalizeNullablePhone(payload.phone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "nationalId")) {
      nextSnapshot.profile.identity.nationalId = normalizeNullableString(payload.nationalId);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "kraPin")) {
      nextSnapshot.profile.identity.kraPin = normalizeNullableString(payload.kraPin);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "nextOfKinName")) {
      nextSnapshot.profile.nextOfKin.name = normalizeNullableString(payload.nextOfKinName);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "nextOfKinPhone")) {
      nextSnapshot.profile.nextOfKin.phone = normalizeNullablePhone(payload.nextOfKinPhone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "nextOfKinRelation")) {
      nextSnapshot.profile.nextOfKin.relation = normalizeNullableString(payload.nextOfKinRelation);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "businessType")) {
      nextSnapshot.profile.business.type = normalizeNullableString(payload.businessType);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "businessYears")) {
      nextSnapshot.profile.business.years = normalizeNullableInteger(payload.businessYears);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "businessLocation")) {
      nextSnapshot.profile.business.location = normalizeNullableString(payload.businessLocation);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "residentialAddress")) {
      nextSnapshot.profile.business.residentialAddress = normalizeNullableString(payload.residentialAddress);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "photo")) {
      nextSnapshot.profile.photo = payload.photo == null
        ? createDefaultSnapshot().profile.photo
        : {
          url: normalizeNullableString(payload.photo.url),
          capturedAt: normalizeNullableString(payload.photo.capturedAt),
          gpsLatitude: normalizeNullableNumber(payload.photo.gpsLatitude),
          gpsLongitude: normalizeNullableNumber(payload.photo.gpsLongitude),
          gpsAccuracyMeters: normalizeNullableNumber(payload.photo.gpsAccuracyMeters),
        };
    }
    if (Object.prototype.hasOwnProperty.call(payload, "gps")) {
      nextSnapshot.profile.gps = payload.gps == null
        ? createDefaultSnapshot().profile.gps
        : {
          latitude: normalizeNullableNumber(payload.gps.latitude),
          longitude: normalizeNullableNumber(payload.gps.longitude),
          accuracyMeters: normalizeNullableNumber(payload.gps.accuracyMeters),
          capturedAt: normalizeNullableString(payload.gps.capturedAt),
        };
    }
    if (Array.isArray(payload.guarantors)) {
      nextSnapshot.guarantors = prepareIncomingGuarantors(payload.guarantors);
    }
    if (Array.isArray(payload.collaterals)) {
      nextSnapshot.collaterals = prepareIncomingCollaterals(payload.collaterals);
    }

    return normalizeSnapshot(nextSnapshot);
  }

  async function writeRefreshEvent(
    queryApi: Pick<TxContext, "run">,
    refreshId: number,
    actorUserId: number | null,
    eventType: string,
    options: {
      fieldPath?: string | null;
      previousValue?: unknown;
      nextValue?: unknown;
      reason?: string | null;
      gpsLatitude?: number | null;
      gpsLongitude?: number | null;
      gpsAccuracyMeters?: number | null;
      deviceCapturedAt?: string | null;
      metadata?: Record<string, unknown> | null;
    } = {},
  ) {
    await queryApi.run(
      `
        INSERT INTO client_profile_refresh_events (
          tenant_id,
          refresh_id,
          event_type,
          field_path,
          actor_user_id,
          previous_value_json,
          next_value_json,
          reason,
          gps_latitude,
          gps_longitude,
          gps_accuracy_meters,
          device_captured_at,
          metadata_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        getTenantId(),
        refreshId,
        eventType,
        options.fieldPath ?? null,
        actorUserId,
        options.previousValue == null ? null : JSON.stringify(options.previousValue),
        options.nextValue == null ? null : JSON.stringify(options.nextValue),
        options.reason ?? null,
        options.gpsLatitude ?? null,
        options.gpsLongitude ?? null,
        options.gpsAccuracyMeters ?? null,
        options.deviceCapturedAt ?? null,
        options.metadata == null ? null : JSON.stringify(options.metadata),
        nowIso(),
      ],
    );
  }

  async function applyApprovedSnapshotToActiveProfile(queryApi: TxContext, clientId: number, snapshot: ProfileSnapshot, userId: number | null, approvedAt: string) {
    const tenantId = getTenantId();
    const branchId = normalizeNullableInteger(snapshot.profile.assignment.branchId);
    const officerId = normalizeNullableInteger(snapshot.profile.assignment.officerId);

    await queryApi.run(
      `
        UPDATE clients
        SET
          full_name = ?,
          phone = ?,
          national_id = ?,
          kra_pin = ?,
          photo_url = ?,
          photo_metadata_json = ?,
          id_document_url = ?,
          next_of_kin_name = ?,
          next_of_kin_phone = ?,
          next_of_kin_relation = ?,
          business_type = ?,
          business_years = ?,
          business_location = ?,
          residential_address = ?,
          latitude = ?,
          longitude = ?,
          location_accuracy_meters = ?,
          location_captured_at = ?,
          officer_id = ?,
          branch_id = ?,
          updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `,
      [
        snapshot.profile.identity.fullName,
        snapshot.profile.identity.phone,
        snapshot.profile.identity.nationalId,
        snapshot.profile.identity.kraPin,
        snapshot.profile.photo.url,
        snapshot.profile.photo.url ? JSON.stringify(snapshot.profile.photo) : null,
        snapshot.profile.documents.idDocumentUrl,
        snapshot.profile.nextOfKin.name,
        snapshot.profile.nextOfKin.phone,
        snapshot.profile.nextOfKin.relation,
        snapshot.profile.business.type,
        snapshot.profile.business.years,
        snapshot.profile.business.location,
        snapshot.profile.business.residentialAddress,
        snapshot.profile.gps.latitude,
        snapshot.profile.gps.longitude,
        snapshot.profile.gps.accuracyMeters,
        snapshot.profile.gps.capturedAt,
        officerId,
        branchId,
        approvedAt,
        clientId,
        tenantId,
      ],
    );

    const activeGuarantors = await queryApi.all(
      `
        SELECT *
        FROM guarantors
        WHERE client_id = ? AND tenant_id = ? AND COALESCE(is_active, 1) = 1
      `,
      [clientId, tenantId],
    );
    const activeCollaterals = await queryApi.all(
      `
        SELECT *
        FROM collateral_assets
        WHERE client_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'active')) IN ('active', 'released')
      `,
      [clientId, tenantId],
    );

    const activeGuarantorsById = new Map(activeGuarantors.map((row) => [Number(row.id), row]));
    const activeCollateralsById = new Map(activeCollaterals.map((row) => [Number(row.id), row]));
    const matchedGuarantorIds = new Set<number>();
    const matchedCollateralIds = new Set<number>();

    for (const guarantor of snapshot.guarantors) {
      const sourceId = normalizeNullableInteger(guarantor.sourceGuarantorId);
      const currentRow = sourceId ? activeGuarantorsById.get(sourceId) : null;
      if (currentRow) {
        matchedGuarantorIds.add(sourceId!);
        if (JSON.stringify(normalizeActiveGuarantorForComparison(currentRow)) === JSON.stringify(normalizeStoredGuarantor(guarantor, 0))) {
          continue;
        }
        await queryApi.run(
          `
            UPDATE guarantors
            SET is_active = 0, updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `,
          [approvedAt, sourceId, tenantId],
        );
      }

      await queryApi.run(
        `
          INSERT INTO guarantors (
            tenant_id,
            full_name,
            phone,
            national_id,
            physical_address,
            occupation,
            employer_name,
            monthly_income,
            guarantee_amount,
            id_document_url,
            is_active,
            client_id,
            branch_id,
            created_by_user_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          guarantor.fullName,
          guarantor.phone,
          guarantor.nationalId,
          guarantor.physicalAddress,
          guarantor.occupation,
          guarantor.employerName,
          guarantor.monthlyIncome ?? 0,
          guarantor.guaranteeAmount ?? 0,
          guarantor.idDocumentUrl,
          clientId,
          branchId,
          userId,
          approvedAt,
          approvedAt,
        ],
      );
    }

    for (const row of activeGuarantors) {
      const rowId = Number(row.id || 0);
      if (!matchedGuarantorIds.has(rowId)) {
        await queryApi.run(
          `
            UPDATE guarantors
            SET is_active = 0, updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `,
          [approvedAt, rowId, tenantId],
        );
      }
    }

    for (const collateral of snapshot.collaterals) {
      const sourceId = normalizeNullableInteger(collateral.sourceCollateralId);
      const currentRow = sourceId ? activeCollateralsById.get(sourceId) : null;
      if (currentRow) {
        matchedCollateralIds.add(sourceId!);
        if (JSON.stringify(normalizeActiveCollateralForComparison(currentRow)) === JSON.stringify(normalizeStoredCollateral(collateral, 0))) {
          continue;
        }
        await queryApi.run(
          `
            UPDATE collateral_assets
            SET status = 'archived', updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `,
          [approvedAt, sourceId, tenantId],
        );
      }

      await queryApi.run(
        `
          INSERT INTO collateral_assets (
            tenant_id,
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
            document_url,
            image_urls_json,
            status,
            client_id,
            branch_id,
            created_by_user_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          collateral.assetType,
          collateral.description,
          collateral.estimatedValue,
          collateral.ownershipType || "client",
          collateral.ownerName,
          collateral.ownerNationalId,
          collateral.registrationNumber,
          collateral.logbookNumber,
          collateral.titleNumber,
          collateral.locationDetails,
          collateral.valuationDate,
          collateral.documentUrl || collateral.imageUrls[0] || null,
          JSON.stringify(collateral.imageUrls || []),
          clientId,
          branchId,
          userId,
          approvedAt,
          approvedAt,
        ],
      );
    }

    for (const row of activeCollaterals) {
      const rowId = Number(row.id || 0);
      if (!matchedCollateralIds.has(rowId)) {
        await queryApi.run(
          `
            UPDATE collateral_assets
            SET status = 'archived', updated_at = ?
            WHERE id = ? AND tenant_id = ?
          `,
          [approvedAt, rowId, tenantId],
        );
      }
    }
  }

  async function createProfileRefresh(clientId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200 || !resolved.client) {
      return { status: resolved.status, body: resolved.body };
    }

    const assignee = await resolveAssignee(resolved.client, payload, user);
    if (assignee.status !== 200) {
      return { status: assignee.status, body: assignee.body };
    }

    const refresh = await executeTransaction(async (tx) => {
      const openRefresh = await tx.get(
        `
          SELECT id, status
          FROM client_profile_refreshes
          WHERE client_id = ? AND tenant_id = ? AND status IN ('draft', 'pending_review', 'pushed_back')
          LIMIT 1
        `,
        [clientId, getTenantId()],
      );
      if (openRefresh) {
        return { status: 409 as const, body: { message: "An open profile refresh already exists for this client", refreshId: Number(openRefresh.id) } };
      }

      const currentVersion = await ensureCurrentProfileVersion(tx, clientId, normalizeNullableInteger(user.sub), "Baseline snapshot captured before refresh request");
      if (!currentVersion?.row || !currentVersion.snapshot) {
        return { status: 404 as const, body: { message: "Client not found" } };
      }

      const createdAt = nowIso();
      const insertResult = await tx.run(
        `
          INSERT INTO client_profile_refreshes (
            tenant_id,
            client_id,
            based_on_version_id,
            based_on_version_number,
            approved_version_id,
            status,
            priority_status,
            requested_by_user_id,
            assigned_to_user_id,
            requested_note,
            locked_fields_json,
            editable_fields_json,
            active_snapshot_json,
            draft_snapshot_json,
            requested_at,
            created_at,
            updated_at,
            pushback_count
          ) VALUES (?, ?, ?, ?, ?, 'draft', 'normal', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `,
        [
          getTenantId(),
          clientId,
          Number(currentVersion.row.id),
          Number(currentVersion.row.version_number),
          null,
          normalizeNullableInteger(user.sub),
          assignee.assigneeId,
          normalizeNullableString(payload.note),
          JSON.stringify([...LOCKED_PII_SECTIONS]),
          JSON.stringify([]),
          stableSnapshotJson(currentVersion.snapshot),
          stableSnapshotJson(currentVersion.snapshot),
          createdAt,
          createdAt,
          createdAt,
        ],
      );

      const refreshId = Number(insertResult.lastID || 0);
      await writeRefreshEvent(tx, refreshId, normalizeNullableInteger(user.sub), "draft_created", {
        metadata: {
          assignedToUserId: assignee.assigneeId,
          basedOnVersionId: Number(currentVersion.row.id),
          basedOnVersionNumber: Number(currentVersion.row.version_number),
        },
      });

      const refreshRow = await loadRefresh(refreshId);
      return {
        status: 201 as const,
        body: {
          message: "Client profile refresh draft created",
          refresh: serializeRefreshRow(refreshRow || {}, [], []),
        },
      };
    }) as { status: number; body: Record<string, any> };

    if (refresh.status === 201) {
      await writeAuditLog({
        userId: user.sub,
        action: "client.profile_refresh.created",
        targetType: "client_profile_refresh",
        targetId: Number(refresh.body?.refresh?.id || 0) || null,
        details: JSON.stringify({
          clientId,
          assignedToUserId: assignee.assigneeId,
          note: payload.note || null,
        }),
        ipAddress,
      });
      await invalidateReportCaches();
    }

    return refresh;
  }

  async function getProfileRefresh(refreshId: number, user: UserLike) {
    const resolved = await resolveRefreshScope(refreshId, user);
    if (resolved.status !== 200 || !resolved.refreshRow) {
      return { status: resolved.status, body: resolved.body };
    }

    const [feedback, events] = await Promise.all([
      loadOpenFeedback(refreshId),
      loadRecentEvents(refreshId),
    ]);

    return {
      status: 200,
      body: serializeRefreshRow(resolved.refreshRow, feedback, events),
    };
  }

  async function updateProfileRefreshDraft(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveRefreshScope(refreshId, user);
    if (resolved.status !== 200 || !resolved.refreshRow) {
      return { status: resolved.status, body: resolved.body };
    }
    if (!canEditRefresh(user, resolved.refreshRow)) {
      return { status: 403, body: { message: "Forbidden: profile refresh is outside your assignment" } };
    }

    const currentStatus = String(resolved.refreshRow.status || "").trim().toLowerCase();
    if (!["draft", "pushed_back"].includes(currentStatus)) {
      return { status: 409, body: { message: "Only draft or pushed-back refreshes can be edited" } };
    }

    const previousSnapshot = parseStoredSnapshot(resolved.refreshRow.draft_snapshot_json);
    const nextSnapshot = prepareDraftSnapshot(previousSnapshot, payload);
    const changes = collectSnapshotChanges(previousSnapshot, nextSnapshot);

    if (changes.length === 0) {
      return {
        status: 200,
        body: {
          message: "No profile refresh changes were applied",
          refresh: serializeRefreshRow(resolved.refreshRow, await loadOpenFeedback(refreshId), await loadRecentEvents(refreshId)),
        },
      };
    }

    const changedSections = [...new Set(changes.map((change) => toSectionPath(change.path)))];
    const hasLockedPiiChange = changedSections.some((section) => LOCKED_PII_SECTIONS.has(section));
    if (hasLockedPiiChange && !isAdmin(user)) {
      return { status: 403, body: { message: "Phone number and national ID changes require an admin override" } };
    }
    if (hasLockedPiiChange && !normalizeNullableString(payload.piiOverrideReason)) {
      return { status: 400, body: { message: "piiOverrideReason is required when changing phone number or national ID" } };
    }

    const editableFields = normalizeFeedbackFieldPaths(parseJson<unknown[]>(resolved.refreshRow.editable_fields_json, []));
    if (currentStatus === "pushed_back" && editableFields.length > 0) {
      const unauthorizedSection = changedSections.find((section) => !editableFields.includes(section));
      if (unauthorizedSection) {
        return {
          status: 403,
          body: {
            message: "Only manager-flagged fields can be edited while corrections are pending",
            blockedField: unauthorizedSection,
          },
        };
      }
    }

    const eventGps = buildEventGps(payload, nextSnapshot);
    const updatedAt = nowIso();

    await executeTransaction(async (tx) => {
      await tx.run(
        `
          UPDATE client_profile_refreshes
          SET draft_snapshot_json = ?, updated_at = ?
          WHERE id = ? AND tenant_id = ?
        `,
        [stableSnapshotJson(nextSnapshot), updatedAt, refreshId, getTenantId()],
      );

      for (const change of changes) {
        await writeRefreshEvent(tx, refreshId, normalizeNullableInteger(user.sub), "field_updated", {
          fieldPath: change.path,
          previousValue: change.previousValue,
          nextValue: change.nextValue,
          reason: hasLockedPiiChange ? normalizeNullableString(payload.piiOverrideReason) : null,
          gpsLatitude: eventGps.gpsLatitude,
          gpsLongitude: eventGps.gpsLongitude,
          gpsAccuracyMeters: eventGps.gpsAccuracyMeters,
          deviceCapturedAt: eventGps.capturedAt,
          metadata: {
            section: toSectionPath(change.path),
            updateNote: normalizeNullableString(payload.note),
          },
        });
      }

      if (currentStatus === "pushed_back" && changedSections.length > 0) {
        const openFeedback = await tx.all(
          `
            SELECT id, field_path
            FROM client_profile_refresh_feedback
            WHERE refresh_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'open')) = 'open'
          `,
          [refreshId, getTenantId()],
        );
        for (const feedbackRow of openFeedback) {
          const feedbackField = String(feedbackRow.field_path || "").trim();
          if (feedbackField && changedSections.includes(feedbackField)) {
            await tx.run(
              `
                UPDATE client_profile_refresh_feedback
                SET status = 'resolved', resolved_by_user_id = ?, resolved_at = ?
                WHERE id = ?
              `,
              [normalizeNullableInteger(user.sub), updatedAt, Number(feedbackRow.id)],
            );
          }
        }
      }
    });

    const updatedRefresh = await loadRefresh(refreshId);
    const [feedback, events] = await Promise.all([
      loadOpenFeedback(refreshId),
      loadRecentEvents(refreshId),
    ]);

    await writeAuditLog({
      userId: user.sub,
      action: hasLockedPiiChange ? "client.profile_refresh.pii_override" : "client.profile_refresh.updated",
      targetType: "client_profile_refresh",
      targetId: refreshId,
      details: JSON.stringify({
        clientId: Number(resolved.refreshRow.client_id),
        changedSections,
        piiOverrideReason: normalizeNullableString(payload.piiOverrideReason),
        note: normalizeNullableString(payload.note),
      }),
      ipAddress,
    });

    return {
      status: 200,
      body: {
        message: "Profile refresh draft updated",
        refresh: serializeRefreshRow(updatedRefresh || resolved.refreshRow, feedback, events),
      },
    };
  }

  async function submitProfileRefresh(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveRefreshScope(refreshId, user);
    if (resolved.status !== 200 || !resolved.refreshRow) {
      return { status: resolved.status, body: resolved.body };
    }
    if (!canEditRefresh(user, resolved.refreshRow)) {
      return { status: 403, body: { message: "Forbidden: profile refresh is outside your assignment" } };
    }

    const currentStatus = String(resolved.refreshRow.status || "").trim().toLowerCase();
    if (!["draft", "pushed_back"].includes(currentStatus)) {
      return { status: 409, body: { message: "Only draft or pushed-back refreshes can be submitted" } };
    }

    const openFeedback = await loadOpenFeedback(refreshId);
    if (openFeedback.length > 0) {
      return {
        status: 409,
        body: {
          message: "Resolve all manager feedback before resubmitting this refresh",
          openFeedback: openFeedback.map((row) => ({
            id: Number(row.id),
            fieldPath: String(row.field_path || ""),
            reasonCode: normalizeNullableString(row.reason_code),
            comment: normalizeNullableString(row.comment),
          })),
        },
      };
    }

    const submittedAt = nowIso();
    await executeTransaction(async (tx) => {
      await tx.run(
        `
          UPDATE client_profile_refreshes
          SET
            status = 'pending_review',
            priority_status = 'normal',
            submitted_by_user_id = ?,
            submission_note = ?,
            submitted_at = ?,
            updated_at = ?,
            editable_fields_json = ?
          WHERE id = ? AND tenant_id = ?
        `,
        [
          normalizeNullableInteger(user.sub),
          normalizeNullableString(payload.note),
          submittedAt,
          submittedAt,
          JSON.stringify([]),
          refreshId,
          getTenantId(),
        ],
      );
      await writeRefreshEvent(tx, refreshId, normalizeNullableInteger(user.sub), "submitted", {
        reason: normalizeNullableString(payload.note),
      });
    });

    const updatedRefresh = await loadRefresh(refreshId);
    const [feedback, events] = await Promise.all([
      loadOpenFeedback(refreshId),
      loadRecentEvents(refreshId),
    ]);

    await writeAuditLog({
      userId: user.sub,
      action: "client.profile_refresh.submitted",
      targetType: "client_profile_refresh",
      targetId: refreshId,
      details: JSON.stringify({
        clientId: Number(resolved.refreshRow.client_id),
        note: normalizeNullableString(payload.note),
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: "Profile refresh submitted for review",
        refresh: serializeRefreshRow(updatedRefresh || resolved.refreshRow, feedback, events),
      },
    };
  }

  async function reviewProfileRefresh(refreshId: number, payload: Record<string, any>, user: UserLike, ipAddress: string) {
    const resolved = await resolveRefreshScope(refreshId, user);
    if (resolved.status !== 200 || !resolved.refreshRow) {
      return { status: resolved.status, body: resolved.body };
    }
    if (!isReviewer(user)) {
      return { status: 403, body: { message: "Forbidden: only reviewers can approve or push back profile refreshes" } };
    }

    const currentStatus = String(resolved.refreshRow.status || "").trim().toLowerCase();
    if (currentStatus !== "pending_review") {
      return { status: 409, body: { message: "Only pending profile refreshes can be reviewed" } };
    }

    const decision = String(payload.decision || "").trim().toLowerCase();
    const reviewAt = nowIso();

    if (decision === "push_back") {
      const flaggedFields = [...new Set(
        (Array.isArray(payload.flaggedFields) ? payload.flaggedFields : [])
          .map((entry: Record<string, any>) => String(entry.fieldPath || "").trim())
          .filter(Boolean),
      )];

      await executeTransaction(async (tx) => {
        await tx.run(
          `
            UPDATE client_profile_refresh_feedback
            SET status = 'resolved', resolved_by_user_id = ?, resolved_at = ?
            WHERE refresh_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'open')) = 'open'
          `,
          [normalizeNullableInteger(user.sub), reviewAt, refreshId, getTenantId()],
        );

        await tx.run(
          `
            UPDATE client_profile_refreshes
            SET
              status = 'pushed_back',
              priority_status = 'priority_correction',
              reviewed_by_user_id = ?,
              review_note = ?,
              reviewed_at = ?,
              updated_at = ?,
              editable_fields_json = ?,
              pushback_count = pushback_count + 1
            WHERE id = ? AND tenant_id = ?
          `,
          [
            normalizeNullableInteger(user.sub),
            normalizeNullableString(payload.note),
            reviewAt,
            reviewAt,
            JSON.stringify(flaggedFields),
            refreshId,
            getTenantId(),
          ],
        );

        for (const field of Array.isArray(payload.flaggedFields) ? payload.flaggedFields : []) {
          await tx.run(
            `
              INSERT INTO client_profile_refresh_feedback (
                tenant_id,
                refresh_id,
                field_path,
                reason_code,
                comment,
                flagged_by_user_id,
                flagged_at,
                status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open')
            `,
            [
              getTenantId(),
              refreshId,
              String(field.fieldPath || "").trim(),
              normalizeNullableString(field.reasonCode),
              normalizeNullableString(field.comment),
              normalizeNullableInteger(user.sub),
              reviewAt,
            ],
          );
        }

        await writeRefreshEvent(tx, refreshId, normalizeNullableInteger(user.sub), "pushed_back", {
          reason: normalizeNullableString(payload.note),
          metadata: {
            flaggedFields,
          },
        });
      });

      const updatedRefresh = await loadRefresh(refreshId);
      const [feedback, events] = await Promise.all([
        loadOpenFeedback(refreshId),
        loadRecentEvents(refreshId),
      ]);

      await writeAuditLog({
        userId: user.sub,
        action: "client.profile_refresh.pushed_back",
        targetType: "client_profile_refresh",
        targetId: refreshId,
        details: JSON.stringify({
          clientId: Number(resolved.refreshRow.client_id),
          flaggedFields,
          note: normalizeNullableString(payload.note),
        }),
        ipAddress,
      });
      await invalidateReportCaches();

      return {
        status: 200,
        body: {
          message: "Profile refresh pushed back for correction",
          refresh: serializeRefreshRow(updatedRefresh || resolved.refreshRow, feedback, events),
        },
      };
    }

    const approvedVersionId = await executeTransaction(async (tx) => {
      const draftSnapshot = parseStoredSnapshot(resolved.refreshRow.draft_snapshot_json);
      const currentVersion = await ensureCurrentProfileVersion(tx, Number(resolved.refreshRow.client_id), normalizeNullableInteger(user.sub), "Baseline snapshot captured before approval");
      const latestVersionNumber = Number(currentVersion?.row?.version_number || resolved.refreshRow.based_on_version_number || 0);
      const approvedVersionNumber = latestVersionNumber + 1;

      const insertVersion = await tx.run(
        `
          INSERT INTO client_profile_versions (
            tenant_id,
            client_id,
            version_number,
            based_on_refresh_id,
            snapshot_json,
            note,
            created_by_user_id,
            approved_by_user_id,
            effective_from,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          getTenantId(),
          Number(resolved.refreshRow.client_id),
          approvedVersionNumber,
          refreshId,
          stableSnapshotJson(draftSnapshot),
          normalizeNullableString(payload.note) || "Approved profile refresh",
          normalizeNullableInteger(resolved.refreshRow.submitted_by_user_id) || normalizeNullableInteger(resolved.refreshRow.requested_by_user_id),
          normalizeNullableInteger(user.sub),
          reviewAt,
          reviewAt,
        ],
      );

      const newApprovedVersionId = Number(insertVersion.lastID || 0);
      await applyApprovedSnapshotToActiveProfile(tx, Number(resolved.refreshRow.client_id), draftSnapshot, normalizeNullableInteger(user.sub), reviewAt);

      await tx.run(
        `
          UPDATE client_profile_refresh_feedback
          SET status = 'resolved', resolved_by_user_id = ?, resolved_at = ?
          WHERE refresh_id = ? AND tenant_id = ? AND LOWER(COALESCE(status, 'open')) = 'open'
        `,
        [normalizeNullableInteger(user.sub), reviewAt, refreshId, getTenantId()],
      );

      await tx.run(
        `
          UPDATE client_profile_refreshes
          SET
            status = 'approved',
            priority_status = 'normal',
            approved_version_id = ?,
            reviewed_by_user_id = ?,
            review_note = ?,
            reviewed_at = ?,
            approved_at = ?,
            updated_at = ?,
            editable_fields_json = ?
          WHERE id = ? AND tenant_id = ?
        `,
        [
          newApprovedVersionId,
          normalizeNullableInteger(user.sub),
          normalizeNullableString(payload.note),
          reviewAt,
          reviewAt,
          reviewAt,
          JSON.stringify([]),
          refreshId,
          getTenantId(),
        ],
      );

      await writeRefreshEvent(tx, refreshId, normalizeNullableInteger(user.sub), "approved", {
        reason: normalizeNullableString(payload.note),
        metadata: {
          approvedVersionId: newApprovedVersionId,
          approvedVersionNumber,
        },
      });

      return newApprovedVersionId;
    }) as number;

    const updatedRefresh = await loadRefresh(refreshId);
    const [feedback, events] = await Promise.all([
      loadOpenFeedback(refreshId),
      loadRecentEvents(refreshId),
    ]);

    await writeAuditLog({
      userId: user.sub,
      action: "client.profile_refresh.approved",
      targetType: "client_profile_refresh",
      targetId: refreshId,
      details: JSON.stringify({
        clientId: Number(resolved.refreshRow.client_id),
        approvedVersionId,
        note: normalizeNullableString(payload.note),
      }),
      ipAddress,
    });
    await invalidateReportCaches();

    return {
      status: 200,
      body: {
        message: "Profile refresh approved and merged into the active profile",
        refresh: serializeRefreshRow(updatedRefresh || resolved.refreshRow, feedback, events),
      },
    };
  }

  async function listRefreshes(query: Record<string, any>, user: UserLike) {
    const scope = await hierarchyService.resolveHierarchyScope(user);
    const tenantId = getTenantId();
    const requestedStatus = normalizeNullableString(query.status)?.toLowerCase() || null;
    const clientId = normalizeNullableInteger(query.clientId);
    const assignedToMe = query.assignedToMe === true;
    const priorityOnly = query.priorityOnly === true;
    const userId = normalizeNullableInteger(user.sub);

    const clauses = ["r.tenant_id = ?"];
    const params: unknown[] = [tenantId];

    if (requestedStatus) {
      clauses.push("LOWER(COALESCE(r.status, 'draft')) = ?");
      params.push(requestedStatus);
    }
    if (clientId) {
      clauses.push("r.client_id = ?");
      params.push(clientId);
    }
    if (priorityOnly) {
      clauses.push("LOWER(COALESCE(r.priority_status, 'normal')) = 'priority_correction'");
    }
    if (assignedToMe && userId) {
      clauses.push("r.assigned_to_user_id = ?");
      params.push(userId);
    }
    if (isLoanOfficer(user) && userId) {
      clauses.push("(r.assigned_to_user_id = ? OR r.requested_by_user_id = ?)");
      params.push(userId, userId);
    }

    const rows = await all(
      `
        SELECT
          r.*,
          c.branch_id AS client_branch_id,
          c.full_name AS client_name,
          b.name AS branch_name,
          requester.full_name AS requested_by_name,
          assignee.full_name AS assigned_to_name,
          reviewer.full_name AS reviewed_by_name
        FROM client_profile_refreshes r
        INNER JOIN clients c ON c.id = r.client_id
        LEFT JOIN branches b ON b.id = c.branch_id
        LEFT JOIN users requester ON requester.id = r.requested_by_user_id
        LEFT JOIN users assignee ON assignee.id = r.assigned_to_user_id
        LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by_user_id
        WHERE ${clauses.join(" AND ")}
        ORDER BY
          CASE WHEN LOWER(COALESCE(r.priority_status, 'normal')) = 'priority_correction' THEN 0 ELSE 1 END,
          COALESCE(r.submitted_at, r.requested_at) DESC,
          r.id DESC
      `,
      params,
    );

    const inScopeRows = rows.filter((row) => hierarchyService.isBranchInScope(scope, row.client_branch_id));
    const refreshIds = inScopeRows.map((row) => Number(row.id || 0)).filter((value) => value > 0);
    const feedbackRows = refreshIds.length > 0
      ? await all(
        `
          SELECT refresh_id, field_path, reason_code, comment
          FROM client_profile_refresh_feedback
          WHERE tenant_id = ? AND LOWER(COALESCE(status, 'open')) = 'open'
            AND refresh_id IN (${refreshIds.map(() => "?").join(", ")})
          ORDER BY flagged_at ASC, id ASC
        `,
        [tenantId, ...refreshIds],
      )
      : [];

    const feedbackByRefreshId = new Map<number, Array<Record<string, any>>>();
    for (const feedbackRow of feedbackRows) {
      const refreshId = Number(feedbackRow.refresh_id || 0);
      if (!feedbackByRefreshId.has(refreshId)) {
        feedbackByRefreshId.set(refreshId, []);
      }
      feedbackByRefreshId.get(refreshId)!.push(feedbackRow);
    }

    return {
      status: 200,
      body: {
        total: inScopeRows.length,
        rows: inScopeRows.map((row) => ({
          id: Number(row.id),
          clientId: Number(row.client_id),
          clientName: row.client_name || null,
          branchName: row.branch_name || null,
          status: String(row.status || "").toLowerCase(),
          priorityStatus: String(row.priority_status || "normal").toLowerCase(),
          requestedAt: row.requested_at || null,
          submittedAt: row.submitted_at || null,
          reviewedAt: row.reviewed_at || null,
          approvedAt: row.approved_at || null,
          requestedByName: row.requested_by_name || null,
          assignedToName: row.assigned_to_name || null,
          reviewedByName: row.reviewed_by_name || null,
          pushbackCount: Number(row.pushback_count || 0),
          flaggedFields: (feedbackByRefreshId.get(Number(row.id)) || []).map((feedbackRow) => ({
            fieldPath: String(feedbackRow.field_path || "").trim(),
            reasonCode: normalizeNullableString(feedbackRow.reason_code),
            comment: normalizeNullableString(feedbackRow.comment),
          })),
        })),
      },
    };
  }

  async function listProfileVersions(clientId: number, user: UserLike) {
    const resolved = await resolveClientScopeClient(clientId, user);
    if (resolved.status !== 200 || !resolved.client) {
      return { status: resolved.status, body: resolved.body };
    }

    const tenantId = getTenantId();
    let versionRows: DbRow[];
    try {
      versionRows = await all(
        `
          SELECT
            v.*,
            created_by.full_name AS created_by_name,
            approved_by.full_name AS approved_by_name
          FROM client_profile_versions v
          LEFT JOIN users created_by ON created_by.id = v.created_by_user_id
          LEFT JOIN users approved_by ON approved_by.id = v.approved_by_user_id
          WHERE v.client_id = ? AND v.tenant_id = ?
          ORDER BY v.version_number ASC
        `,
        [clientId, tenantId],
      );
    } catch (error) {
      if (isProfileRefreshSchemaUnavailable(error)) {
        return {
          status: 200,
          body: {
            clientId,
            currentVersionId: null,
            versions: [],
            pendingRefresh: null,
          },
        };
      }
      throw error;
    }
    const loanRows = await all(
      `
        SELECT id, status, created_at, disbursed_at
        FROM loans
        WHERE client_id = ? AND tenant_id = ?
        ORDER BY COALESCE(disbursed_at, created_at) ASC, id ASC
      `,
      [clientId, tenantId],
    );
    let pendingRefresh: DbRow | null | undefined;
    try {
      pendingRefresh = await get(
        `
          SELECT id, status, priority_status, requested_at, submitted_at
          FROM client_profile_refreshes
          WHERE client_id = ? AND tenant_id = ? AND status IN ('draft', 'pending_review', 'pushed_back')
          ORDER BY id DESC
          LIMIT 1
        `,
        [clientId, tenantId],
      );
    } catch (error) {
      if (isProfileRefreshSchemaUnavailable(error)) {
        pendingRefresh = null;
      } else {
        throw error;
      }
    }

    const versionSummaries = versionRows.map((row) => {
      const snapshot = parseStoredSnapshot(row.snapshot_json);
      return {
        id: Number(row.id),
        versionNumber: Number(row.version_number),
        effectiveFrom: row.effective_from || null,
        createdAt: row.created_at || null,
        createdByUserId: normalizeNullableInteger(row.created_by_user_id),
        createdByName: row.created_by_name || null,
        approvedByUserId: normalizeNullableInteger(row.approved_by_user_id),
        approvedByName: row.approved_by_name || null,
        note: normalizeNullableString(row.note),
        summary: {
          businessLocation: snapshot.profile.business.location,
          residentialAddress: snapshot.profile.business.residentialAddress,
          gps: snapshot.profile.gps,
          guarantorCount: snapshot.guarantors.length,
          collateralCount: snapshot.collaterals.length,
          photoUrl: snapshot.profile.photo.url,
        },
        loanIds: [] as number[],
        snapshot,
      };
    });

    for (const loan of loanRows) {
      const referenceAt = loan.disbursed_at || loan.created_at || nowIso();
      let matchedVersion = versionSummaries[0] || null;
      for (const version of versionSummaries) {
        if (version.effectiveFrom && String(version.effectiveFrom) <= String(referenceAt)) {
          matchedVersion = version;
        }
      }
      if (matchedVersion) {
        matchedVersion.loanIds.push(Number(loan.id));
      }
    }

    return {
      status: 200,
      body: {
        clientId,
        currentVersionId: versionSummaries.length > 0 ? versionSummaries[versionSummaries.length - 1]!.id : null,
        versions: versionSummaries.map((version) => ({
          ...version,
          snapshot: undefined,
        })),
        pendingRefresh: pendingRefresh
          ? {
            id: Number(pendingRefresh.id),
            status: String(pendingRefresh.status || "").toLowerCase(),
            priorityStatus: String(pendingRefresh.priority_status || "normal").toLowerCase(),
            requestedAt: pendingRefresh.requested_at || null,
            submittedAt: pendingRefresh.submitted_at || null,
          }
          : null,
      },
    };
  }

  async function getProfileVersion(clientId: number, versionId: number, user: UserLike) {
    const versionsResult = await listProfileVersions(clientId, user);
    if (versionsResult.status !== 200) {
      return versionsResult;
    }
    if (!Array.isArray(versionsResult.body?.versions) || versionsResult.body.versions.length === 0) {
      return { status: 404, body: { message: "Profile version not found" } };
    }

    const tenantId = getTenantId();
    const versionRow = await get(
      `
        SELECT
          v.*,
          created_by.full_name AS created_by_name,
          approved_by.full_name AS approved_by_name
        FROM client_profile_versions v
        LEFT JOIN users created_by ON created_by.id = v.created_by_user_id
        LEFT JOIN users approved_by ON approved_by.id = v.approved_by_user_id
        WHERE v.id = ? AND v.client_id = ? AND v.tenant_id = ?
        LIMIT 1
      `,
      [versionId, clientId, tenantId],
    );
    if (!versionRow) {
      return { status: 404, body: { message: "Profile version not found" } };
    }

    const versions = Array.isArray(versionsResult.body?.versions) ? versionsResult.body.versions : [];
    const versionSummary = versions.find((entry: Record<string, any>) => Number(entry.id) === versionId) || null;

    return {
      status: 200,
      body: {
        clientId,
        version: {
          id: Number(versionRow.id),
          versionNumber: Number(versionRow.version_number),
          effectiveFrom: versionRow.effective_from || null,
          createdAt: versionRow.created_at || null,
          createdByUserId: normalizeNullableInteger(versionRow.created_by_user_id),
          createdByName: versionRow.created_by_name || null,
          approvedByUserId: normalizeNullableInteger(versionRow.approved_by_user_id),
          approvedByName: versionRow.approved_by_name || null,
          note: normalizeNullableString(versionRow.note),
          loanIds: Array.isArray(versionSummary?.loanIds) ? versionSummary.loanIds : [],
          snapshot: parseStoredSnapshot(versionRow.snapshot_json),
        },
      },
    };
  }

  async function buildHistoryAugmentation(clientId: number, user: UserLike) {
    const versionsResult = await listProfileVersions(clientId, user);
    if (versionsResult.status !== 200) {
      return null;
    }
    return {
      currentProfileVersionId: versionsResult.body.currentVersionId || null,
      profileVersions: versionsResult.body.versions || [],
      pendingProfileRefresh: versionsResult.body.pendingRefresh || null,
    };
  }

  return {
    createProfileRefresh,
    getProfileRefresh,
    updateProfileRefreshDraft,
    submitProfileRefresh,
    reviewProfileRefresh,
    listRefreshes,
    listProfileVersions,
    getProfileVersion,
    buildHistoryAugmentation,
  };
}

export {
  createClientProfileRefreshService,
};
