import { parsePaginationQuery, parseSortQuery, createPagedResponse } from "../../utils/http.js";
import { buildTabularExport } from "../reportExportService.js";
import { createClientReadRepository } from "../../repositories/clientReadRepository.js";
import {
  normalizeExportFormat,
  buildClientListExportFilename,
  mapClientListExportRows,
} from "./clientTransformers.js";
import {
  normalizeName,
  normalizeNationalId,
  normalizePhone,
  tokenizeName,
  scorePotentialDuplicate,
} from "./clientValidation.js";
import type { DbAll, DbGet, HierarchyServiceLike } from "../../types/serviceContracts.js";

type UserLike = Record<string, any>;
type QueryLike = Record<string, any>;

type PotentialDuplicateResult = Record<string, unknown> & {
  id?: number | string;
  matchScore: number;
  matchSignals: string[];
};

type ClientReadServiceDeps = {
  all: DbAll;
  get: DbGet;
  hierarchyService: HierarchyServiceLike;
};

function isLoanOfficer(user: Record<string, unknown> | null | undefined) {
  return String(user?.role || "").toLowerCase() === "loan_officer";
}

function createClientReadService(deps: ClientReadServiceDeps) {
  const { all, get, hierarchyService } = deps;
  const clientReadRepository = createClientReadRepository({ all, get });

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
      requirePagination: false,
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

  return {
    listClients,
    findPotentialDuplicates,
  };
}

export {
  createClientReadService,
};
