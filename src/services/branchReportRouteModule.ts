import { buildTabularExport } from "./reportExportService.js";
import type { BranchManagementRouteOptions } from "./branchManagementRouteTypes.js";

function registerBranchReportRoutes(options: BranchManagementRouteOptions) {
  const {
    app,
    authenticate,
    authorize,
    hierarchyService,
    getScope,
    get,
    all,
  } = options;

  app.get("/api/reports/hierarchy/performance", authenticate, authorize("admin", "operations_manager", "area_manager"), async (req, res, next) => {
    try {
      const scope = await getScope(req);
      const scopeCondition = hierarchyService.buildScopeCondition(scope, "l.branch_id");
      const scopeSql = scopeCondition.sql ? `WHERE ${scopeCondition.sql}` : "";

      const summary = await get(
        `
          SELECT
            COUNT(DISTINCT l.id) AS total_loans,
            COUNT(DISTINCT c.id) AS total_clients,
            SUM(CASE WHEN l.status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            ROUND(COALESCE(SUM(l.repaid_total), 0), 2) AS repaid_total,
            ROUND(COALESCE(SUM(CASE WHEN l.status IN ('active', 'restructured') THEN l.balance ELSE 0 END), 0), 2) AS outstanding_balance
          FROM loans l
          LEFT JOIN clients c ON c.id = l.client_id
          ${scopeSql}
        `,
        scopeCondition.params,
      );

      const branchPerformance = await all(
        `
          SELECT
            b.id AS branch_id,
            b.name AS branch_name,
            b.code AS branch_code,
            r.id AS region_id,
            r.name AS region_name,
            COUNT(DISTINCT c.id) AS total_clients,
            COUNT(DISTINCT l.id) AS total_loans,
            SUM(CASE WHEN l.status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            ROUND(COALESCE(SUM(l.repaid_total), 0), 2) AS repaid_total,
            ROUND(COALESCE(SUM(CASE WHEN l.status IN ('active', 'restructured') THEN l.balance ELSE 0 END), 0), 2) AS outstanding_balance
          FROM branches b
          INNER JOIN regions r ON r.id = b.region_id
          LEFT JOIN clients c ON c.branch_id = b.id
          LEFT JOIN loans l ON l.branch_id = b.id
          ${scopeCondition.sql ? `WHERE ${scopeCondition.sql.replace(/l\.branch_id/g, "b.id")}` : ""}
          GROUP BY b.id
          ORDER BY r.name ASC, b.name ASC
        `,
        scopeCondition.params,
      );

      const roPerformance = await all(
        `
          SELECT
            u.id AS user_id,
            u.full_name,
            u.email,
            u.branch_id,
            b.name AS branch_name,
            COUNT(l.id) AS total_loans,
            SUM(CASE WHEN l.status IN ('active', 'restructured') THEN 1 ELSE 0 END) AS active_loans,
            ROUND(COALESCE(SUM(l.repaid_total), 0), 2) AS repaid_total,
            ROUND(COALESCE(SUM(CASE WHEN l.status IN ('active', 'restructured') THEN l.balance ELSE 0 END), 0), 2) AS outstanding_balance
          FROM users u
          INNER JOIN branches b ON b.id = u.branch_id
          LEFT JOIN loans l ON l.created_by_user_id = u.id
          WHERE u.role = 'loan_officer'
            ${scopeCondition.sql ? `AND ${scopeCondition.sql.replace(/l\.branch_id/g, "u.branch_id")}` : ""}
          GROUP BY u.id
          ORDER BY b.name ASC, u.full_name ASC
        `,
        scopeCondition.params,
      );

      const requestedFormat = String(req.query.format || "json").trim().toLowerCase() || "json";
      if (!["json", "csv", "pdf", "xlsx"].includes(requestedFormat)) {
        res.status(400).json({ message: "Invalid format. Use one of: json, csv, pdf, xlsx." });
        return;
      }
      if (requestedFormat !== "json") {
        const headers = [
          "region_name",
          "branch_name",
          "branch_code",
          "total_clients",
          "total_loans",
          "active_loans",
          "repaid_total",
          "outstanding_balance",
        ];
        const exportPayload = buildTabularExport({
          format: requestedFormat,
          filenameBase: "hierarchy-performance",
          title: "Hierarchy Performance Report",
          headers,
          rows: branchPerformance,
        });
        res.setHeader("Content-Type", exportPayload.contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${exportPayload.filename || "hierarchy-performance"}"`);
        res.status(200).send(exportPayload.body || "");
        return;
      }

      res.status(200).json({
        scope,
        summary: {
          total_loans: Number(summary?.total_loans || 0),
          total_clients: Number(summary?.total_clients || 0),
          active_loans: Number(summary?.active_loans || 0),
          repaid_total: Number(summary?.repaid_total || 0),
          outstanding_balance: Number(summary?.outstanding_balance || 0),
        },
        branchPerformance,
        roPerformance,
      });
    } catch (error) {
      next(error);
    }
  });
}

export {
  registerBranchReportRoutes,
};
