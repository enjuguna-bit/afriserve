import { getCurrentTenantId } from "../utils/tenantStore.js";
import { parsePaginationQuery, createPagedResponse } from "../utils/http.js";
import type { RouteRegistrar } from "../types/routeDeps.js";
import { createLoanCollateralReadRepository } from "../repositories/loanCollateralReadRepository.js";

const collateralAssetTypes = ["chattel", "vehicle", "land", "equipment", "machinery", "inventory", "livestock", "savings"] as const;

type LoanCollateralRouteOptions = {
  app: RouteRegistrar;
  authenticate: (...args: any[]) => any;
  authorize: (...roles: string[]) => (...args: any[]) => any;
  parseId: (value: unknown) => number | null;
  createGuarantorSchema: { parse: (value: unknown) => any };
  createCollateralAssetSchema: { parse: (value: unknown) => any };
  linkLoanGuarantorSchema: { parse: (value: unknown) => any };
  linkLoanCollateralSchema: { parse: (value: unknown) => any };
  resolveRiskRecordBranchId: (user: Record<string, any>, requestedBranchId: number | null | undefined) => Promise<number>;
  resolveLoanInScope: (loanId: number, user: Record<string, unknown>) => Promise<{ scope: any; loan: Record<string, any> }>;
  hierarchyService: any;
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<{ lastID?: number; changes?: number; [key: string]: unknown }>;
  writeAuditLog: (payload: Record<string, any>) => Promise<void> | void;
  collateralManageRoles: string[];
  collateralViewRoles: string[];
};

function registerLoanCollateralRoutes(options: LoanCollateralRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    parseId,
    createGuarantorSchema,
    createCollateralAssetSchema,
    linkLoanGuarantorSchema,
    linkLoanCollateralSchema,
    resolveRiskRecordBranchId,
    resolveLoanInScope,
    hierarchyService,
    get,
    all,
    run,
    writeAuditLog,
    collateralManageRoles,
    collateralViewRoles,
  } = options;
  const loanCollateralReadRepository = createLoanCollateralReadRepository({ all, get });

  // ── POST /api/guarantors ────────────────────────────────────────────────────
  app.post("/api/guarantors", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const payload = createGuarantorSchema.parse(req.body || {});
      const branchId = await resolveRiskRecordBranchId(req.user, payload.branchId || null);

      if (payload.nationalId) {
        const existingGuarantor = await get(
          `SELECT id FROM guarantors
           WHERE tenant_id = ? AND LOWER(TRIM(COALESCE(national_id, ''))) = LOWER(TRIM(?))`,
          [tenantId, payload.nationalId],
        );
        if (existingGuarantor) {
          res.status(409).json({ message: "A guarantor with this national ID already exists" });
          return;
        }
      }

      const insertResult = await run(
        `INSERT INTO guarantors (
            full_name, phone, national_id, physical_address, occupation,
            employer_name, monthly_income, guarantee_amount, branch_id,
            created_by_user_id, tenant_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          payload.fullName,
          payload.phone || null,
          payload.nationalId || null,
          payload.physicalAddress || null,
          payload.occupation || null,
          payload.employerName || null,
          payload.monthlyIncome || 0,
          payload.guaranteeAmount || 0,
          branchId,
          req.user.sub,
          tenantId,
        ],
      );

      const guarantor = await get(
        "SELECT * FROM guarantors WHERE id = ? AND tenant_id = ?",
        [insertResult.lastID, tenantId],
      );
      await writeAuditLog({
        userId: req.user.sub,
        action: "guarantor.created",
        targetType: "guarantor",
        targetId: Number(insertResult.lastID),
        details: JSON.stringify({ fullName: payload.fullName, branchId }),
        ipAddress: req.ip,
      });

      res.status(201).json(guarantor);
    } catch (error) {
      next(error);
    }
  });

  // ── GET /api/guarantors ─────────────────────────────────────────────────────
  app.get("/api/guarantors", authenticate, authorize(...collateralViewRoles), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const search = String(req.query.search || "").trim().toLowerCase();
      const scopeCondition = hierarchyService.buildScopeCondition(scope, "g.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { rows: guarantors, total } = await loanCollateralReadRepository.listGuarantors({
        search: search || undefined,
        scopeCondition,
        limit,
        offset,
      });

      res.status(200).json(
        createPagedResponse({ data: guarantors, total, limit, offset, sortBy: "id", sortOrder: "desc" }),
      );
    } catch (error) {
      next(error);
    }
  });

  // ── POST /api/collateral-assets ─────────────────────────────────────────────
  app.post("/api/collateral-assets", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const payload = createCollateralAssetSchema.parse(req.body || {});
      const branchId = await resolveRiskRecordBranchId(req.user, payload.branchId || null);

      if (payload.registrationNumber) {
        const existingByReg = await get(
          `SELECT id FROM collateral_assets
           WHERE tenant_id = ? AND LOWER(TRIM(COALESCE(registration_number, ''))) = LOWER(TRIM(?))`,
          [tenantId, payload.registrationNumber],
        );
        if (existingByReg) {
          res.status(409).json({ message: "A collateral asset with this registration number already exists" });
          return;
        }
      }
      if (payload.logbookNumber) {
        const existingByLogbook = await get(
          `SELECT id FROM collateral_assets
           WHERE tenant_id = ? AND LOWER(TRIM(COALESCE(logbook_number, ''))) = LOWER(TRIM(?))`,
          [tenantId, payload.logbookNumber],
        );
        if (existingByLogbook) {
          res.status(409).json({ message: "A collateral asset with this logbook number already exists" });
          return;
        }
      }
      if (payload.titleNumber) {
        const existingByTitle = await get(
          `SELECT id FROM collateral_assets
           WHERE tenant_id = ? AND LOWER(TRIM(COALESCE(title_number, ''))) = LOWER(TRIM(?))`,
          [tenantId, payload.titleNumber],
        );
        if (existingByTitle) {
          res.status(409).json({ message: "A collateral asset with this title number already exists" });
          return;
        }
      }

      const insertResult = await run(
        `INSERT INTO collateral_assets (
            asset_type, description, estimated_value, ownership_type,
            owner_name, owner_national_id, registration_number, logbook_number,
            title_number, location_details, valuation_date, branch_id,
            created_by_user_id, tenant_id, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
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
          branchId,
          req.user.sub,
          tenantId,
        ],
      );

      const collateralAsset = await get(
        "SELECT * FROM collateral_assets WHERE id = ? AND tenant_id = ?",
        [insertResult.lastID, tenantId],
      );
      await writeAuditLog({
        userId: req.user.sub,
        action: "collateral_asset.created",
        targetType: "collateral_asset",
        targetId: Number(insertResult.lastID),
        details: JSON.stringify({ assetType: payload.assetType, estimatedValue: payload.estimatedValue, branchId }),
        ipAddress: req.ip,
      });

      res.status(201).json(collateralAsset);
    } catch (error) {
      next(error);
    }
  });

  // ── GET /api/collateral-assets ──────────────────────────────────────────────
  app.get("/api/collateral-assets", authenticate, authorize(...collateralViewRoles), async (req, res, next) => {
    try {
      const scope = await hierarchyService.resolveHierarchyScope(req.user);
      const search = String(req.query.search || "").trim().toLowerCase();

      const assetType = String(req.query.assetType || "").trim().toLowerCase();
      if (assetType) {
        if (!collateralAssetTypes.includes(assetType as (typeof collateralAssetTypes)[number])) {
          res.status(400).json({ message: `Invalid assetType. Use one of: ${collateralAssetTypes.join(", ")}` });
          return;
        }
      }

      const status = String(req.query.status || "").trim().toLowerCase();
      if (status) {
        if (!["active", "released", "liquidated"].includes(status)) {
          res.status(400).json({ message: "Invalid status. Use one of: active, released, liquidated" });
          return;
        }
      }

      const scopeCondition = hierarchyService.buildScopeCondition(scope, "ca.branch_id");
      const { limit, offset } = parsePaginationQuery(req.query, {
        defaultLimit: 50,
        maxLimit: 200,
        requirePagination: true,
        strict: true,
      });
      const { rows: collateralAssets, total } = await loanCollateralReadRepository.listCollateralAssets({
        search: search || undefined,
        assetType: (assetType || undefined) as (typeof collateralAssetTypes)[number] | undefined,
        status: (status || undefined) as "active" | "released" | "liquidated" | undefined,
        scopeCondition,
        limit,
        offset,
      });

      res.status(200).json(
        createPagedResponse({ data: collateralAssets, total, limit, offset, sortBy: "id", sortOrder: "desc" }),
      );
    } catch (error) {
      next(error);
    }
  });

  // ── POST /api/loans/:id/guarantors ──────────────────────────────────────────
  app.post("/api/loans/:id/guarantors", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      if (!loanId) { res.status(400).json({ message: "Invalid loan id" }); return; }

      const payload = linkLoanGuarantorSchema.parse(req.body || {});
      const { loan, scope } = await resolveLoanInScope(loanId, req.user);
      if (["closed", "written_off", "rejected"].includes(String(loan.status || "").toLowerCase())) {
        res.status(409).json({ message: "Cannot attach guarantor to this loan status" });
        return;
      }

      const guarantor = await get(
        "SELECT * FROM guarantors WHERE id = ? AND tenant_id = ?",
        [payload.guarantorId, tenantId],
      );
      if (!guarantor) { res.status(404).json({ message: "Guarantor not found" }); return; }
      if (!hierarchyService.isBranchInScope(scope, guarantor.branch_id)) {
        res.status(403).json({ message: "Forbidden: guarantor is outside your scope" });
        return;
      }
      if (Number(guarantor.is_active || 0) !== 1) {
        res.status(409).json({ message: "Cannot link an inactive guarantor" });
        return;
      }

      const existingLink = await get(
        "SELECT id FROM loan_guarantors WHERE loan_id = ? AND guarantor_id = ? AND tenant_id = ?",
        [loanId, payload.guarantorId, tenantId],
      );
      if (existingLink) {
        res.status(409).json({ message: "Guarantor is already linked to this loan" });
        return;
      }

      const insertResult = await run(
        `INSERT INTO loan_guarantors (
            loan_id, guarantor_id, guarantee_amount, relationship_to_client,
            liability_type, note, created_by_user_id, tenant_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          loanId,
          payload.guarantorId,
          payload.guaranteeAmount || 0,
          payload.relationshipToClient || null,
          payload.liabilityType || "individual",
          payload.note || null,
          req.user.sub,
          tenantId,
        ],
      );

      const linkedGuarantor = await get(
        `SELECT lg.*, g.full_name, g.phone, g.national_id, g.branch_id
         FROM loan_guarantors lg
         INNER JOIN guarantors g ON g.id = lg.guarantor_id
         WHERE lg.id = ? AND lg.tenant_id = ?`,
        [insertResult.lastID, tenantId],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.guarantor.linked",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          guarantorId: payload.guarantorId,
          guaranteeAmount: payload.guaranteeAmount || 0,
          liabilityType: payload.liabilityType || "individual",
        }),
        ipAddress: req.ip,
      });

      res.status(201).json(linkedGuarantor);
    } catch (error) {
      next(error);
    }
  });

  // ── GET /api/loans/:id/guarantors ───────────────────────────────────────────
  app.get("/api/loans/:id/guarantors", authenticate, authorize(...collateralViewRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      if (!loanId) { res.status(400).json({ message: "Invalid loan id" }); return; }

      await resolveLoanInScope(loanId, req.user);
      const loanGuarantors = await all(
        `SELECT
            lg.id AS loan_guarantor_id, lg.loan_id, lg.guarantor_id,
            lg.guarantee_amount, lg.relationship_to_client, lg.liability_type,
            lg.note, lg.created_at,
            g.full_name, g.phone, g.national_id, g.physical_address,
            g.occupation, g.employer_name, g.monthly_income, g.guarantee_amount
          FROM loan_guarantors lg
          INNER JOIN guarantors g ON g.id = lg.guarantor_id
          WHERE lg.loan_id = ? AND lg.tenant_id = ?
          ORDER BY lg.id DESC`,
        [loanId, tenantId],
      );

      res.status(200).json(loanGuarantors);
    } catch (error) {
      next(error);
    }
  });

  // ── DELETE /api/loans/:id/guarantors/:loanGuarantorId ───────────────────────
  app.delete("/api/loans/:id/guarantors/:loanGuarantorId", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      const loanGuarantorId = parseId(req.params.loanGuarantorId);
      if (!loanId || !loanGuarantorId) {
        res.status(400).json({ message: "Invalid loan or loan guarantor id" });
        return;
      }

      await resolveLoanInScope(loanId, req.user);
      const linkedGuarantor = await get(
        `SELECT lg.id, lg.loan_id, lg.guarantor_id, lg.guarantee_amount, lg.liability_type, g.full_name
         FROM loan_guarantors lg
         INNER JOIN guarantors g ON g.id = lg.guarantor_id
         WHERE lg.id = ? AND lg.loan_id = ? AND lg.tenant_id = ?`,
        [loanGuarantorId, loanId, tenantId],
      );
      if (!linkedGuarantor) {
        res.status(404).json({ message: "Loan guarantor link not found" });
        return;
      }

      await run(
        "DELETE FROM loan_guarantors WHERE id = ? AND loan_id = ? AND tenant_id = ?",
        [loanGuarantorId, loanId, tenantId],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.guarantor.unlinked",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          loanGuarantorId,
          guarantorId: linkedGuarantor.guarantor_id,
          guaranteeAmount: linkedGuarantor.guarantee_amount,
          liabilityType: linkedGuarantor.liability_type,
        }),
        ipAddress: req.ip,
      });

      res.status(200).json({ message: "Guarantor unlinked from loan", removedLink: linkedGuarantor });
    } catch (error) {
      next(error);
    }
  });

  // ── POST /api/loans/:id/collaterals ─────────────────────────────────────────
  app.post("/api/loans/:id/collaterals", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      if (!loanId) { res.status(400).json({ message: "Invalid loan id" }); return; }

      const payload = linkLoanCollateralSchema.parse(req.body || {});
      const { loan, scope } = await resolveLoanInScope(loanId, req.user);
      if (["closed", "written_off", "rejected"].includes(String(loan.status || "").toLowerCase())) {
        res.status(409).json({ message: "Cannot attach collateral to this loan status" });
        return;
      }

      const collateralAsset = await get(
        "SELECT * FROM collateral_assets WHERE id = ? AND tenant_id = ?",
        [payload.collateralAssetId, tenantId],
      );
      if (!collateralAsset) { res.status(404).json({ message: "Collateral asset not found" }); return; }
      if (!hierarchyService.isBranchInScope(scope, collateralAsset.branch_id)) {
        res.status(403).json({ message: "Forbidden: collateral asset is outside your scope" });
        return;
      }
      if (String(collateralAsset.status || "").toLowerCase() !== "active") {
        res.status(409).json({ message: "Only active collateral assets can be linked to loans" });
        return;
      }

      const existingLink = await get(
        "SELECT id FROM loan_collaterals WHERE loan_id = ? AND collateral_asset_id = ? AND tenant_id = ?",
        [loanId, payload.collateralAssetId, tenantId],
      );
      if (existingLink) {
        res.status(409).json({ message: "Collateral asset is already linked to this loan" });
        return;
      }

      const insertResult = await run(
        `INSERT INTO loan_collaterals (
            loan_id, collateral_asset_id, forced_sale_value, lien_rank,
            note, created_by_user_id, tenant_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          loanId,
          payload.collateralAssetId,
          payload.forcedSaleValue || null,
          payload.lienRank || 1,
          payload.note || null,
          req.user.sub,
          tenantId,
        ],
      );

      const linkedCollateral = await get(
        `SELECT
            lc.id AS loan_collateral_id, lc.loan_id, lc.collateral_asset_id,
            lc.forced_sale_value, lc.lien_rank, lc.note, lc.created_at,
            ca.asset_type, ca.description, ca.estimated_value,
            ca.registration_number, ca.logbook_number, ca.title_number, ca.status
          FROM loan_collaterals lc
          INNER JOIN collateral_assets ca ON ca.id = lc.collateral_asset_id
          WHERE lc.id = ? AND lc.tenant_id = ?`,
        [insertResult.lastID, tenantId],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.collateral.linked",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          collateralAssetId: payload.collateralAssetId,
          forcedSaleValue: payload.forcedSaleValue || null,
          lienRank: payload.lienRank || 1,
        }),
        ipAddress: req.ip,
      });

      res.status(201).json(linkedCollateral);
    } catch (error) {
      next(error);
    }
  });

  // ── GET /api/loans/:id/collaterals ──────────────────────────────────────────
  app.get("/api/loans/:id/collaterals", authenticate, authorize(...collateralViewRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      if (!loanId) { res.status(400).json({ message: "Invalid loan id" }); return; }

      await resolveLoanInScope(loanId, req.user);
      const loanCollaterals = await all(
        `SELECT
            lc.id AS loan_collateral_id, lc.loan_id, lc.collateral_asset_id,
            lc.forced_sale_value, lc.lien_rank, lc.note, lc.created_at,
            ca.asset_type, ca.description, ca.estimated_value,
            ca.ownership_type, ca.owner_name, ca.owner_national_id,
            ca.registration_number, ca.logbook_number, ca.title_number,
            ca.location_details, ca.valuation_date, ca.status
          FROM loan_collaterals lc
          INNER JOIN collateral_assets ca ON ca.id = lc.collateral_asset_id
          WHERE lc.loan_id = ? AND lc.tenant_id = ?
          ORDER BY lc.lien_rank ASC, lc.id ASC`,
        [loanId, tenantId],
      );

      res.status(200).json(loanCollaterals);
    } catch (error) {
      next(error);
    }
  });

  // ── DELETE /api/loans/:id/collaterals/:loanCollateralId ─────────────────────
  app.delete("/api/loans/:id/collaterals/:loanCollateralId", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      const loanCollateralId = parseId(req.params.loanCollateralId);
      if (!loanId || !loanCollateralId) {
        res.status(400).json({ message: "Invalid loan or loan collateral id" });
        return;
      }

      await resolveLoanInScope(loanId, req.user);
      const linkedCollateral = await get(
        `SELECT lc.id, lc.loan_id, lc.collateral_asset_id, lc.forced_sale_value, lc.lien_rank, ca.description, ca.status
         FROM loan_collaterals lc
         INNER JOIN collateral_assets ca ON ca.id = lc.collateral_asset_id
         WHERE lc.id = ? AND lc.loan_id = ? AND lc.tenant_id = ?`,
        [loanCollateralId, loanId, tenantId],
      );
      if (!linkedCollateral) {
        res.status(404).json({ message: "Loan collateral link not found" });
        return;
      }

      await run(
        "DELETE FROM loan_collaterals WHERE id = ? AND loan_id = ? AND tenant_id = ?",
        [loanCollateralId, loanId, tenantId],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.collateral.unlinked",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          loanCollateralId,
          collateralAssetId: linkedCollateral.collateral_asset_id,
          forcedSaleValue: linkedCollateral.forced_sale_value,
          lienRank: linkedCollateral.lien_rank,
        }),
        ipAddress: req.ip,
      });

      res.status(200).json({ message: "Collateral unlinked from loan", removedLink: linkedCollateral });
    } catch (error) {
      next(error);
    }
  });

  // ── POST /api/loans/:id/collaterals/:loanCollateralId/release ───────────────
  app.post("/api/loans/:id/collaterals/:loanCollateralId/release", authenticate, authorize(...collateralManageRoles), async (req, res, next) => {
    try {
      const tenantId = getCurrentTenantId();
      const loanId = parseId(req.params.id);
      const loanCollateralId = parseId(req.params.loanCollateralId);
      if (!loanId || !loanCollateralId) {
        res.status(400).json({ message: "Invalid loan or loan collateral id" });
        return;
      }

      await resolveLoanInScope(loanId, req.user);
      const linkedCollateral = await get(
        `SELECT lc.id, lc.loan_id, lc.collateral_asset_id, lc.forced_sale_value, lc.lien_rank, ca.description, ca.status
         FROM loan_collaterals lc
         INNER JOIN collateral_assets ca ON ca.id = lc.collateral_asset_id
         WHERE lc.id = ? AND lc.loan_id = ? AND lc.tenant_id = ?`,
        [loanCollateralId, loanId, tenantId],
      );
      if (!linkedCollateral) {
        res.status(404).json({ message: "Loan collateral link not found" });
        return;
      }

      await run(
        "DELETE FROM loan_collaterals WHERE id = ? AND loan_id = ? AND tenant_id = ?",
        [loanCollateralId, loanId, tenantId],
      );
      await run(
        "UPDATE collateral_assets SET status = 'released', updated_at = datetime('now') WHERE id = ? AND tenant_id = ?",
        [linkedCollateral.collateral_asset_id, tenantId],
      );

      await writeAuditLog({
        userId: req.user.sub,
        action: "loan.collateral.released",
        targetType: "loan",
        targetId: loanId,
        details: JSON.stringify({
          loanCollateralId,
          collateralAssetId: linkedCollateral.collateral_asset_id,
          forcedSaleValue: linkedCollateral.forced_sale_value,
          lienRank: linkedCollateral.lien_rank,
        }),
        ipAddress: req.ip,
      });

      const releasedAsset = await get(
        "SELECT * FROM collateral_assets WHERE id = ? AND tenant_id = ?",
        [linkedCollateral.collateral_asset_id, tenantId],
      );
      res.status(200).json({
        message: "Collateral released from loan",
        removedLink: linkedCollateral,
        collateralAsset: releasedAsset,
      });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerLoanCollateralRoutes,
};
