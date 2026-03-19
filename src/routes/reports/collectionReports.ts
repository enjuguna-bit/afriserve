import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import type { RouteRegistrar } from "../../types/routeDeps.js";

function registerCollectionReports(app: RouteRegistrar, context: Record<string, any>) {
  const {
    get,
    all,
    authenticate,
    authorize,
    parseId,
    hierarchyService,
    reportRoles,
    resolveFormat,
    parseDateParam,
    applyScopeAndBranchFilter,
    resolveCachedReport,
    sendTabularExport,
  } = context;

  function resolveOfficerFilter(rawOfficerIds: unknown, rawOfficerId: unknown, res: any): number[] | null | undefined {
    const tokens = [rawOfficerIds, rawOfficerId]
      .flatMap((value) => Array.isArray(value) ? value : [value])
      .flatMap((value) => String(value || "").split(","))
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.toLowerCase() !== "all");

    if (tokens.length === 0) {
      return null;
    }

    const officerIds = [...new Set(tokens.map((value) => parseId(value)))].filter(
      (value): value is number => Number.isInteger(value) && Number(value) > 0,
    );
    if (officerIds.length !== tokens.length) {
      res.status(400).json({ message: "Invalid officerId or officerIds filter" });
      return undefined;
    }

    return officerIds.sort((left, right) => left - right);
  }

  function buildIdListClause(sqlExpression: string, ids: number[] | null | undefined) {
    if (!ids || ids.length === 0) {
      return null;
    }

    return {
      sql: `${sqlExpression} IN (${ids.map(() => "?").join(", ")})`,
      params: ids,
    };
  }

  function applyOfficerFilter(whereBuilder: ReturnType<typeof createSqlWhereBuilder>, sqlExpression: string, ids: number[] | null | undefined) {
    const clause = buildIdListClause(sqlExpression, ids);
    if (!clause) {
      return;
    }
    whereBuilder.addClause(clause.sql, clause.params);
  }

  /**
   * GET /api/reports/collections
   *
   * Repayment collections received in a period.
   * Shows total collected, loan count, collection rate vs what was due.
   */
  app.get(
    "/api/reports/collections",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        
        const tableColumnCache = new Map<string, Set<string> | null>();

        async function loadTableColumns(table: string): Promise<Set<string> | null> {
          if (tableColumnCache.has(table)) {
            return tableColumnCache.get(table) ?? null;
          }

          const normalizedTable = String(table || "").trim();
          if (!normalizedTable) {
            tableColumnCache.set(table, null);
            return null;
          }

          let columns: Set<string> | null = null;

          try {
            const pragmaRows = await all(`PRAGMA table_info(${normalizedTable})`);
            if (Array.isArray(pragmaRows)) {
              columns = new Set(
                pragmaRows
                  .map((row) => String(row?.name || "").trim().toLowerCase())
                  .filter(Boolean),
              );
            }
          } catch (error) {
            const errorMessage = String((error as { message?: unknown })?.message || error || "");
            if (!/pragma|syntax error|near "pragma"/i.test(errorMessage)) {
              throw error;
            }
          }

          if (!columns) {
            try {
              const infoRows = await all(
                "SELECT column_name FROM information_schema.columns WHERE table_name = ?",
                [normalizedTable],
              );
              columns = new Set(
                infoRows
                  .map((row: Record<string, any>) => String(row?.column_name || "").trim().toLowerCase())
                  .filter(Boolean),
              );
            } catch (error) {
              const errorMessage = String((error as { message?: unknown })?.message || error || "");
              if (!/information_schema|does not exist|relation/i.test(errorMessage)) {
                throw error;
              }
            }
          }

          tableColumnCache.set(table, columns);
          return columns;
        }

        async function columnExists(table: string, column: string): Promise<boolean> {
          const normalizedColumn = String(column || "").trim().toLowerCase();
          if (!normalizedColumn) {
            return false;
          }

          const columns = await loadTableColumns(table);
          if (columns) {
            return columns.has(normalizedColumn);
          }

          try {
            await get(`SELECT ${column} FROM ${table} LIMIT 1`);
            return true;
          } catch (error) {
            const errorMessage = String((error as { message?: unknown })?.message || error || "");
            if (/no such column|does not exist|column .* does not exist|unknown column/i.test(errorMessage)) {
              return false;
            }
            if (/no such table|relation .* does not exist/i.test(errorMessage)) {
              return false;
            }
            throw error;
          }
        }
        const hasPaymentProvider = await columnExists("repayments", "payment_provider");
        const hasPaymentChannel = await columnExists("repayments", "payment_channel");
        const hasExternalReceipt = await columnExists("repayments", "external_receipt");
        const hasExternalReference = await columnExists("repayments", "external_reference");
        const hasPayerPhone = await columnExists("repayments", "payer_phone");

        const isMpesaReport = String(req.originalUrl || "").toLowerCase().includes("mpesa-payments") || 
                             req.query.mpesaOnly === "true";

        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("r.paid_at", dateFrom, dateTo);

        if (isMpesaReport) {
          const mpesaFilterClauses: string[] = [];
          if (hasPaymentProvider) {
            mpesaFilterClauses.push("LOWER(COALESCE(r.payment_provider, '')) LIKE '%mpesa%'");
          }
          if (hasPaymentChannel) {
            mpesaFilterClauses.push("LOWER(COALESCE(r.payment_channel, '')) IN ('mobile_money', 'mpesa', 'c2b', 'stk', 'mobile_money_c2b')");
          }
          if (hasExternalReceipt) {
            mpesaFilterClauses.push("LOWER(COALESCE(r.external_receipt, '')) LIKE 'mpesa%'");
          }
          whereBuilder.addClause(
            mpesaFilterClauses.length > 0
              ? `(${mpesaFilterClauses.join(" OR ")})`
              : "1 = 0",
          );
        }

        const uniquePayersExpr = hasPayerPhone
          ? "COALESCE(NULLIF(TRIM(r.payer_phone), ''), NULLIF(TRIM(c.phone), ''))"
          : "NULLIF(TRIM(c.phone), '')";
        const payerPhoneExpr = hasPayerPhone
          ? "COALESCE(NULLIF(TRIM(r.payer_phone), ''), c.phone)"
          : "c.phone";

        applyOfficerFilter(whereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }

        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();
        const cacheKeyPayload = {
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
        };

        const summary = await resolveCachedReport({
          namespace: "reports:mpesa-payments:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => get(
            `
              SELECT
                COUNT(r.id) AS payment_count,
                COALESCE(SUM(r.amount), 0) AS total_paid,
                COUNT(DISTINCT r.loan_id) AS unique_loans,
                COUNT(DISTINCT ${uniquePayersExpr}) AS unique_payers
              FROM repayments r
              INNER JOIN loans l ON l.id = r.loan_id
              INNER JOIN clients c ON c.id = l.client_id
              ${whereSql}
            `,
            queryParams,
          ),
        });

        const payments = await resolveCachedReport({
          namespace: "reports:mpesa-payments:list",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => all(
            `
              SELECT
                r.id AS repayment_id,
                r.paid_at,
                r.loan_id,
                l.client_id,
                c.full_name AS client_name,
                ${payerPhoneExpr} AS payer_phone,
                ${hasExternalReceipt ? "r.external_receipt" : "NULL"} AS external_receipt,
                ${hasExternalReference ? "r.external_reference" : "NULL"} AS external_reference,
                r.amount,
                ${hasPaymentChannel ? "r.payment_channel" : "NULL"} AS payment_channel,
                ${hasPaymentProvider ? "r.payment_provider" : "NULL"} AS payment_provider,
                b.id AS branch_id,
                b.name AS branch_name,
                u.id AS field_officer_id,
                u.full_name AS field_officer
              FROM repayments r
              INNER JOIN loans l ON l.id = r.loan_id
              INNER JOIN clients c ON c.id = l.client_id
              LEFT JOIN branches b ON b.id = l.branch_id
              LEFT JOIN users u ON u.id = COALESCE(l.officer_id, l.created_by_user_id)
              ${whereSql}
              ORDER BY datetime(r.paid_at) DESC, r.id DESC
            `,
            queryParams,
          ),
        });

        if (format !== "json") {
          const cols = [
            "repayment_id",
            "paid_at",
            "loan_id",
            "client_id",
            "client_name",
            "payer_phone",
            "external_receipt",
            "external_reference",
            "amount",
            "payment_channel",
            "payment_provider",
            "branch_id",
            "branch_name",
            "field_officer_id",
            "field_officer",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: "mpesa-payments-report",
            title: "Mpesa Payments Report",
            headers: cols,
            rows: payments,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary: {
            payment_count: Number(summary?.payment_count || 0),
            total_paid: Number(summary?.total_paid || 0),
            unique_loans: Number(summary?.unique_loans || 0),
            unique_payers: Number(summary?.unique_payers || 0),
          },
          payments,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // 6. Daily / MTD Collections Summary
  app.get(
    "/api/reports/daily-collections",
    authenticate,
    authorize(...reportRoles),
    async (req, res, next) => {
      try {
        const scope = await hierarchyService.resolveHierarchyScope(req.user);
        const format = resolveFormat(req.query.format, res);
        if (!format) return;

        const dateFrom = parseDateParam(req.query.dateFrom, "dateFrom", res);
        if (dateFrom === undefined) return;
        const dateTo = parseDateParam(req.query.dateTo, "dateTo", res);
        if (dateTo === undefined) return;
        if (dateFrom && dateTo && new Date(dateFrom) > new Date(dateTo)) {
          return res.status(400).json({ message: "dateFrom must be before or equal to dateTo." });
        }

        const branchFilter = parseId(req.query.branchId);
        const officerIdsFilter = resolveOfficerFilter(req.query.officerIds, req.query.officerId, res);
        if (officerIdsFilter === undefined) {
          return;
        }
        const whereBuilder = createSqlWhereBuilder();
        whereBuilder.addDateRange("r.paid_at", dateFrom, dateTo);
        applyOfficerFilter(whereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }
        const whereSql = whereBuilder.buildWhere();
        const queryParams = whereBuilder.getParams();

        const dailyCollections = await resolveCachedReport({
          namespace: "reports:daily-collections:list",
          user: req.user,
          scope,
          keyPayload: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
            branchId: branchFilter || null,
            officerIds: officerIdsFilter || null,
          },
          compute: async () => all(
            `
              SELECT
                date(datetime(r.paid_at)) AS date,
                COUNT(r.id) AS repayment_count,
                COALESCE(SUM(r.amount), 0) AS total_collected,
                COUNT(DISTINCT r.loan_id) AS unique_loans
              FROM repayments r
              INNER JOIN loans l ON l.id = r.loan_id
              ${whereSql}
              GROUP BY date(datetime(r.paid_at))
              ORDER BY date(datetime(r.paid_at)) ASC
            `,
            queryParams,
          ),
        });

        if (format !== "json") {
          const cols = ["date", "repayment_count", "total_collected", "unique_loans"];
          sendTabularExport(res, {
            format,
            filenameBase: "daily-collections-report",
            title: "Daily Collections Report",
            headers: cols,
            rows: dailyCollections,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          dailyCollections,
        });
      } catch (error) {
        next(error);
      }
    },
  );
}

export {
  registerCollectionReports,
};

