import { createSqlWhereBuilder } from "../../utils/sqlBuilder.js";
import { normalizeKenyanPhone } from "../../utils/helpers.js";
import {
  buildDailyCollectionBreakdownRows,
  buildPeriodCollectionBreakdownSummary,
  buildRepaymentContributionRows,
  loadRepaymentCollectionEvents,
} from "../../services/repaymentCollectionReportService.js";
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
   * Shows total collected, loan count, and how cash split between period dues and arrears.
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

        const isMpesaReport = String(req.originalUrl || "").toLowerCase().includes("mpesa-payments")
          || req.query.mpesaOnly === "true";
        const collectionFocus = String(req.query.collectionFocus || "").trim().toLowerCase();
        if (collectionFocus && collectionFocus !== "arrears_only") {
          return res.status(400).json({ message: "Invalid collectionFocus filter. Use arrears_only." });
        }

        const repaymentWhereBuilder = createSqlWhereBuilder();
        repaymentWhereBuilder.addDateRange("r.paid_at", dateFrom, dateTo);

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
          repaymentWhereBuilder.addClause(
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

        applyOfficerFilter(repaymentWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: repaymentWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }

        const repaymentWhereSql = repaymentWhereBuilder.buildWhere();
        const repaymentParams = repaymentWhereBuilder.getParams();

        const dueWhereBuilder = createSqlWhereBuilder();
        dueWhereBuilder.addDateRange("i.due_date", dateFrom, dateTo);
        applyOfficerFilter(dueWhereBuilder, "l.officer_id", officerIdsFilter);
        if (!applyScopeAndBranchFilter({
          whereBuilder: dueWhereBuilder,
          scope,
          branchColumnRef: "l.branch_id",
          branchFilter,
          tenantColumnRef: "l.tenant_id",
          res,
        })) {
          return;
        }

        const dueWhereSql = dueWhereBuilder.buildWhere();
        const dueParams = dueWhereBuilder.getParams();
        const cacheKeyPayload = {
          reportMode: isMpesaReport ? "mpesa" : "all",
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
          branchId: branchFilter || null,
          officerIds: officerIdsFilter || null,
          collectionFocus: collectionFocus || null,
        };

        const summary = await resolveCachedReport({
          namespace: "reports:collections:summary",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => {
            const [baseSummary, dueSummary, collectionEvents] = await Promise.all([
              get(
                `
                  SELECT
                    COUNT(DISTINCT ${uniquePayersExpr}) AS unique_payers
                  FROM repayments r
                  INNER JOIN loans l ON l.id = r.loan_id
                  INNER JOIN clients c ON c.id = l.client_id
                  ${repaymentWhereSql}
                `,
                repaymentParams,
              ),
              get(
                `
                  SELECT
                    COALESCE(SUM(i.amount_due), 0) AS total_due
                  FROM loan_installments i
                  INNER JOIN loans l ON l.id = i.loan_id
                  ${dueWhereSql}
                `,
                dueParams,
              ),
              loadRepaymentCollectionEvents({
                all,
                repaymentWhereSql,
                repaymentWhereParams: repaymentParams,
                dateTo,
              }),
            ]);

            const breakdown = buildPeriodCollectionBreakdownSummary({
              events: collectionEvents,
              dateFrom,
              dateTo,
            });
            const totalDue = Number(dueSummary?.total_due || 0);
            const collectionRate = totalDue > 0
              ? Number((breakdown.period_due_collected / totalDue).toFixed(4))
              : 0;

            return {
              repayment_count: breakdown.repayment_count,
              payment_count: breakdown.repayment_count,
              total_collected: breakdown.total_collected,
              total_paid: breakdown.total_collected,
              unique_loans: breakdown.loans_with_repayments,
              loans_with_repayments: breakdown.loans_with_repayments,
              unique_payers: Number(baseSummary?.unique_payers || 0),
              period_due_collected: breakdown.period_due_collected,
              arrears_collected: breakdown.arrears_collected,
              advance_collected: breakdown.advance_collected,
              unapplied_credit: breakdown.unapplied_credit,
              total_due: totalDue,
              collection_rate: collectionRate,
            };
          },
        });

        const repaymentContributions = await resolveCachedReport({
          namespace: "reports:collections:contributions",
          user: req.user,
          scope,
          keyPayload: cacheKeyPayload,
          compute: async () => buildRepaymentContributionRows(
            await loadRepaymentCollectionEvents({
              all,
              repaymentWhereSql,
              repaymentWhereParams: repaymentParams,
              dateTo,
            }),
          ),
        });

        const payments = await resolveCachedReport({
          namespace: "reports:collections:list",
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
              ${repaymentWhereSql}
              ORDER BY r.paid_at DESC, r.id DESC
            `,
            repaymentParams,
          ),
        });

        const repaymentContributionMap = new Map<number, Record<string, any>>(
          (repaymentContributions as Array<Record<string, any>>).map((row) => [Number(row.repayment_id || 0), row]),
        );
        const enrichedPayments: Array<Record<string, any>> = (payments as Array<Record<string, any>>).map((payment) => {
          const contribution = repaymentContributionMap.get(Number(payment.repayment_id || 0));
          return {
            ...payment,
            current_due_collected: Number(contribution?.current_due_collected || 0),
            arrears_collected: Number(contribution?.arrears_collected || 0),
            advance_collected: Number(contribution?.advance_collected || 0),
            unapplied_credit: Number(contribution?.unapplied_credit || 0),
          };
        });
        const filteredPayments: Array<Record<string, any>> = collectionFocus === "arrears_only"
          ? enrichedPayments.filter((payment) => Number(payment.arrears_collected || 0) > 0)
          : enrichedPayments;

        const normalizedSummary = collectionFocus === "arrears_only"
          ? (() => {
            const focusedLoanIds = new Set<number>();
            const focusedPayers = new Set<string>();
            let focusedArrearsCollected = 0;

            for (const payment of filteredPayments) {
              const loanId = Number(payment.loan_id || 0);
              if (loanId > 0) {
                focusedLoanIds.add(loanId);
              }
              const payerKey = Number(payment.client_id || 0) > 0
                ? `client:${Number(payment.client_id || 0)}`
                : String(normalizeKenyanPhone(payment.payer_phone) || payment.client_name || "").trim().toLowerCase();
              if (payerKey) {
                focusedPayers.add(payerKey);
              }
              focusedArrearsCollected += Number(payment.arrears_collected || 0);
            }

            const focusedAmount = Number(focusedArrearsCollected.toFixed(2));
            return {
              repayment_count: filteredPayments.length,
              payment_count: filteredPayments.length,
              total_collected: focusedAmount,
              total_paid: focusedAmount,
              unique_loans: focusedLoanIds.size,
              loans_with_repayments: focusedLoanIds.size,
              unique_payers: focusedPayers.size,
              period_due_collected: 0,
              arrears_collected: focusedAmount,
              advance_collected: 0,
              unapplied_credit: 0,
              total_due: Number(summary?.total_due || 0),
              collection_rate: 0,
            };
          })()
          : {
            repayment_count: Number(summary?.repayment_count || 0),
            payment_count: Number(summary?.payment_count || 0),
            total_collected: Number(summary?.total_collected || 0),
            total_paid: Number(summary?.total_paid || 0),
            unique_loans: Number(summary?.unique_loans || 0),
            loans_with_repayments: Number(summary?.loans_with_repayments || 0),
            unique_payers: Number(summary?.unique_payers || 0),
            period_due_collected: Number(summary?.period_due_collected || 0),
            arrears_collected: Number(summary?.arrears_collected || 0),
            advance_collected: Number(summary?.advance_collected || 0),
            unapplied_credit: Number(summary?.unapplied_credit || 0),
            total_due: Number(summary?.total_due || 0),
            collection_rate: Number(summary?.collection_rate || 0),
          };

        const branchBreakdown = filteredPayments.reduce((rows: Map<number, {
          branch_id: number;
          branch_name: string | null;
          payment_count: number;
          total_collected: number;
        }>, payment: Record<string, any>) => {
          const branchId = Number(payment.branch_id || 0);
          if (!branchId) {
            return rows;
          }

          const existing = rows.get(branchId) || {
            branch_id: branchId,
            branch_name: payment.branch_name || null,
            payment_count: 0,
            total_collected: 0,
          };
          const contributionAmount = collectionFocus === "arrears_only"
            ? Number(payment.arrears_collected || 0)
            : Number(payment.amount || 0);
          existing.branch_name = payment.branch_name || existing.branch_name;
          existing.payment_count += 1;
          existing.total_collected = Number((existing.total_collected + contributionAmount).toFixed(2));
          rows.set(branchId, existing);
          return rows;
        }, new Map<number, { branch_id: number; branch_name: string | null; payment_count: number; total_collected: number }>());

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
            "current_due_collected",
            "arrears_collected",
            "advance_collected",
            "unapplied_credit",
            "payment_channel",
            "payment_provider",
            "branch_id",
            "branch_name",
            "field_officer_id",
            "field_officer",
          ];
          sendTabularExport(res, {
            format,
            filenameBase: isMpesaReport ? "mpesa-payments-report" : "collections-report",
            title: isMpesaReport ? "Mpesa Payments Report" : "Collections Report",
            headers: cols,
            rows: filteredPayments,
          });
          return;
        }

        return res.status(200).json({
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          focus: collectionFocus || null,
          summary: normalizedSummary,
          branchBreakdown: [...branchBreakdown.values()].sort((left, right) => String(left.branch_name || "").localeCompare(String(right.branch_name || ""))),
          payments: filteredPayments.map((row: Record<string, any>) => ({
            ...row,
            payer_phone: normalizeKenyanPhone(row.payer_phone),
          })),
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
          compute: async () => buildDailyCollectionBreakdownRows(
            await loadRepaymentCollectionEvents({
              all,
              repaymentWhereSql: whereSql,
              repaymentWhereParams: queryParams,
              dateTo,
            }),
          ),
        });

        if (format !== "json") {
          const cols = [
            "date",
            "repayment_count",
            "total_collected",
            "current_due_collected",
            "arrears_collected",
            "advance_collected",
            "unapplied_credit",
            "unique_loans",
          ];
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
          dailyCollections: dailyCollections.map((row: Record<string, any>) => ({
            date: row.date,
            repayment_count: Number(row.repayment_count || 0),
            total_collected: Number(row.total_collected || 0),
            current_due_collected: Number(row.current_due_collected || 0),
            arrears_collected: Number(row.arrears_collected || 0),
            advance_collected: Number(row.advance_collected || 0),
            unapplied_credit: Number(row.unapplied_credit || 0),
            unique_loans: Number(row.unique_loans || 0),
          })),
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


