import { ForbiddenScopeError } from "../domain/errors.js";
import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

interface ReportQueryServiceDeps {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  readGet?: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  readAll?: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  hierarchyService: {
    buildScopeCondition: (scope: unknown, branchColumnRef: string) => { sql: string; params: unknown[] };
    isBranchInScope: (scope: unknown, branchId: number) => boolean;
  };
  resolveCachedReport: <T = any>(options: {
    namespace: string;
    user: Record<string, any> | undefined;
    scope: unknown;
    keyPayload?: Record<string, unknown>;
    compute: () => Promise<T>;
  }) => Promise<T>;
}

function createReportQueryService(deps: ReportQueryServiceDeps) {
  const {
    readAll = deps.all,
    hierarchyService,
    resolveCachedReport,
  } = deps;

  // ─── shared helpers ──────────────────────────────────────────────────────

  function normalizeOverdueAsOf(value: unknown, fallbackDateTo?: string | null): string {
    const explicitValue = String(value || fallbackDateTo || "").trim();
    if (explicitValue) {
      return explicitValue;
    }

    const now = new Date();
    const endOfUtcDay = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      23,
      59,
      59,
      999,
    ));
    return endOfUtcDay.toISOString();
  }

  function normalizeScopeBranchIds(scope: unknown): number[] {
    if (!scope || typeof scope !== "object") {
      return [];
    }

    const scopeRecord = scope as { level?: string; branchIds?: unknown[] };
    if (String(scopeRecord.level || "").toLowerCase() === "hq") {
      return [];
    }

    if (!Array.isArray(scopeRecord.branchIds)) {
      return [];
    }

    return [...new Set(
      scopeRecord.branchIds
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    )];
  }

  function normalizeOfficerIds(officerIdFilter?: number | number[] | null): number[] {
    if (Array.isArray(officerIdFilter)) {
      return [...new Set(
        officerIdFilter
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      )].sort((left, right) => left - right);
    }

    const normalizedOfficerId = Number(officerIdFilter || 0);
    return Number.isInteger(normalizedOfficerId) && normalizedOfficerId > 0
      ? [normalizedOfficerId]
      : [];
  }

  function buildIdListClause(columnRef: string, ids: number[] | null | undefined) {
    if (!ids || ids.length === 0) {
      return null;
    }

    if (ids.length === 1) {
      return {
        sql: `${columnRef} = ?`,
        params: [ids[0]],
      };
    }

    return {
      sql: `${columnRef} IN (${ids.map(() => "?").join(", ")})`,
      params: ids,
    };
  }

  function addOfficerFilter(
    whereBuilder: ReturnType<typeof createSqlWhereBuilder>,
    officerIds: number[] | null | undefined,
  ) {
    const condition = buildIdListClause("l.officer_id", officerIds);
    if (condition) {
      whereBuilder.addCondition(condition);
    }
  }

  function addLoanLifecycleDateFilter(
    whereBuilder: ReturnType<typeof createSqlWhereBuilder>,
    dateFrom?: string | null,
    dateTo?: string | null,
  ) {
    if (!dateFrom && !dateTo) {
      return;
    }

    const disbursedClauses: string[] = [];
    const disbursedParams: unknown[] = [];
    const createdClauses: string[] = [];
    const createdParams: unknown[] = [];

    if (dateFrom) {
      disbursedClauses.push("datetime(l.disbursed_at) >= datetime(?)");
      disbursedParams.push(dateFrom);
      createdClauses.push("datetime(l.created_at) >= datetime(?)");
      createdParams.push(dateFrom);
    }

    if (dateTo) {
      disbursedClauses.push("datetime(l.disbursed_at) <= datetime(?)");
      disbursedParams.push(dateTo);
      createdClauses.push("datetime(l.created_at) <= datetime(?)");
      createdParams.push(dateTo);
    }

    const disbursedSql = disbursedClauses.length > 0 ? disbursedClauses.join(" AND ") : "1 = 1";
    const createdSql = createdClauses.length > 0 ? createdClauses.join(" AND ") : "1 = 1";

    whereBuilder.addClause(
      `((l.disbursed_at IS NOT NULL AND ${disbursedSql}) OR (l.disbursed_at IS NULL AND ${createdSql}))`,
      [...disbursedParams, ...createdParams],
    );
  }

  function buildScopedLoanWhere(
    scope: unknown,
    mineOnly: boolean,
    user: Record<string, any> | undefined,
    officerIdFilter?: number | number[] | null,
    branchFilter?: number | null,
    dateFrom?: string | null,
    dateTo?: string | null,
  ) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    const whereBuilder = createSqlWhereBuilder();
    // Tenant isolation — must come first so it anchors all subsequent conditions.
    whereBuilder.addEquals("l.tenant_id", getCurrentTenantId());
    whereBuilder.addCondition(hierarchyService.buildScopeCondition(scope, "l.branch_id"));
    if (branchFilter) {
      whereBuilder.addEquals("l.branch_id", Number(branchFilter));
    }
    if (mineOnly) {
      whereBuilder.addEquals("l.officer_id", Number(user?.sub || 0) || -1);
    } else {
      addOfficerFilter(whereBuilder, normalizeOfficerIds(officerIdFilter));
    }
    addLoanLifecycleDateFilter(whereBuilder, dateFrom, dateTo);
    return whereBuilder;
  }

  async function listPortfolioLoans(whereBuilder: ReturnType<typeof createSqlWhereBuilder>) {
    return readAll(
      `
        SELECT
          l.id,
          l.branch_id,
          l.status,
          COALESCE(l.principal, 0) AS principal,
          COALESCE(l.expected_total, 0) AS expected_total,
          -- FIX #7: loans.repaid_total resets to 0 on restructure/refinance/term-extension.
          -- Sum from repayments table for accurate lifetime collections per loan.
          COALESCE((
            SELECT SUM(r.applied_amount)
            FROM repayments r
            WHERE r.loan_id = l.id
          ), 0) AS repaid_total,
          COALESCE(l.balance, 0) AS balance
        FROM loans l
        ${whereBuilder.buildWhere()}
      `,
      whereBuilder.getParams(),
    );
  }

  async function listOverdueInstallments(loanIds: number[], overdueAsOf: string) {
    const loanCondition = buildIdListClause("loan_id", loanIds);
    if (!loanCondition) {
      return [];
    }

    const whereBuilder = createSqlWhereBuilder();
    whereBuilder.addCondition(loanCondition);
    whereBuilder.addClause("LOWER(COALESCE(status, '')) <> 'paid'");
    whereBuilder.addClause("datetime(due_date) < datetime(?)", [overdueAsOf]);

    return readAll(
      `
        SELECT
          loan_id,
          COALESCE(amount_due, 0) AS amount_due,
          COALESCE(amount_paid, 0) AS amount_paid
        FROM loan_installments
        ${whereBuilder.buildWhere()}
      `,
      whereBuilder.getParams(),
    );
  }

  async function listBranchesForBreakdown(scope: unknown, branchFilter?: number | null) {
    const scopedBranchIds = normalizeScopeBranchIds(scope);
    const whereBuilder = createSqlWhereBuilder();
    if (branchFilter) {
      whereBuilder.addEquals("id", branchFilter);
    } else {
      const scopedCondition = buildIdListClause("id", scopedBranchIds);
      if (scopedCondition) {
        whereBuilder.addCondition(scopedCondition);
      }
    }

    return readAll(
      `
        SELECT
          id,
          name,
          code,
          region_id
        FROM branches
        ${whereBuilder.buildWhere()}
        ORDER BY region_id ASC, name ASC
      `,
      whereBuilder.getParams(),
    );
  }

  async function listRegionsByIds(regionIds: number[]) {
    const regionCondition = buildIdListClause("id", regionIds);
    if (!regionCondition) {
      return [];
    }

    return readAll(
      `
        SELECT
          id,
          name
        FROM regions
        WHERE ${regionCondition.sql}
      `,
      regionCondition.params,
    );
  }

  async function listDisbursedLoans(args: {
    scope: unknown;
    branchFilter: number | null;
    officerIds: number[];
    dateFrom: string | null;
    dateTo: string | null;
  }) {
    const whereBuilder = createSqlWhereBuilder();
    whereBuilder.addEquals("l.tenant_id", getCurrentTenantId());
    whereBuilder.addClause("l.disbursed_at IS NOT NULL");
    whereBuilder.addCondition(hierarchyService.buildScopeCondition(args.scope, "l.branch_id"));
    if (args.branchFilter) {
      whereBuilder.addEquals("l.branch_id", Number(args.branchFilter));
    }
    addOfficerFilter(whereBuilder, args.officerIds);
    whereBuilder.addDateRange("l.disbursed_at", args.dateFrom, args.dateTo);

    return readAll(
      `
        SELECT
          l.id,
          l.branch_id,
          l.client_id,
          l.disbursed_at,
          COALESCE(l.principal, 0) AS principal,
          COALESCE(l.expected_total, 0) AS expected_total,
          COALESCE(l.registration_fee, 0) AS registration_fee,
          COALESCE(l.processing_fee, 0) AS processing_fee,
          COALESCE(l.term_weeks, 0) AS term_weeks
        FROM loans l
        ${whereBuilder.buildWhere()}
      `,
      whereBuilder.getParams(),
    );
  }

  async function listHistoricalDisbursements(clientIds: number[]) {
    const clientCondition = buildIdListClause("client_id", clientIds);
    if (!clientCondition) {
      return [];
    }

    return readAll(
      `
        SELECT
          id,
          client_id,
          disbursed_at
        FROM loans
        WHERE ${clientCondition.sql}
          AND disbursed_at IS NOT NULL
          AND tenant_id = ?
      `,
      [...clientCondition.params, getCurrentTenantId()],
    );
  }

  function aggregateLoanPortfolio(loans: Array<Record<string, any>>) {
    const activeStatuses = new Set(["active", "restructured"]);

    const totals = {
      total_loans: loans.length,
      active_loans: 0,
      restructured_loans: 0,
      written_off_loans: 0,
      principal_disbursed: 0,
      expected_total: 0,
      repaid_total: 0,
      outstanding_balance: 0,
      written_off_balance: 0,
    };

    for (const loan of loans) {
      const status = String(loan.status || "").toLowerCase();
      const principal = Number(loan.principal || 0);
      const expectedTotal = Number(loan.expected_total || 0);
      const repaidTotal = Number(loan.repaid_total || 0);
      const balance = Number(loan.balance || 0);

      totals.principal_disbursed += principal;
      totals.expected_total += expectedTotal;
      totals.repaid_total += repaidTotal;

      if (activeStatuses.has(status)) {
        totals.active_loans += 1;
        totals.outstanding_balance += balance;
      }
      if (status === "restructured") {
        totals.restructured_loans += 1;
      }
      if (status === "written_off") {
        totals.written_off_loans += 1;
        totals.written_off_balance += balance;
      }
    }

    return {
      ...totals,
      principal_disbursed: Number(totals.principal_disbursed.toFixed(2)),
      expected_total: Number(totals.expected_total.toFixed(2)),
      repaid_total: Number(totals.repaid_total.toFixed(2)),
      outstanding_balance: Number(totals.outstanding_balance.toFixed(2)),
      written_off_balance: Number(totals.written_off_balance.toFixed(2)),
    };
  }

  // ─── existing reports ─────────────────────────────────────────────────────

  async function getPortfolioReport({
    user,
    scope,
    includeBreakdown,
    mineOnly,
    officerIdFilter,
    branchFilter,
    dateFrom,
    dateTo,
    overdueAsOf,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    includeBreakdown: boolean;
    mineOnly: boolean;
    officerIdFilter?: number | number[] | null;
    branchFilter?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    overdueAsOf?: string | null;
  }) {
    const normalizedOfficerIds = normalizeOfficerIds(officerIdFilter);
    const normalizedBranchFilter = Number.isInteger(Number(branchFilter)) && Number(branchFilter) > 0
      ? Number(branchFilter)
      : null;
    const normalizedOverdueAsOf = normalizeOverdueAsOf(overdueAsOf, dateTo);

    return resolveCachedReport({
      namespace: "reports:portfolio",
      user,
      scope,
      keyPayload: {
        includeBreakdown,
        scopeFilter: mineOnly ? "mine" : "all",
        officerIds: normalizedOfficerIds,
        branchId: normalizedBranchFilter,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        overdueAsOf: normalizedOverdueAsOf,
      },
      compute: async () => {
        const loanWhere = buildScopedLoanWhere(
          scope,
          mineOnly,
          user,
          normalizedOfficerIds,
          normalizedBranchFilter,
          dateFrom,
          dateTo,
        );
        const loans = await listPortfolioLoans(loanWhere);
        const totals = aggregateLoanPortfolio(loans);

        const activeLoanIds = loans
          .filter((loan) => ["active", "restructured"].includes(String(loan.status || "").toLowerCase()))
          .map((loan) => Number(loan.id));
        const overdueInstallments = activeLoanIds.length > 0
          ? await listOverdueInstallments(activeLoanIds, normalizedOverdueAsOf)
          : [];

        const overdueLoanIds = new Set(overdueInstallments.map((installment) => Number(installment.loan_id)));
        const totalOutstanding = Number(totals?.outstanding_balance || 0);
        const atRiskOutstanding = Number(
          loans
            .reduce(
              (sum, loan) => (
                overdueLoanIds.has(Number(loan.id))
                  ? sum + Number(loan.balance || 0)
                  : sum
              ),
              0,
            )
            .toFixed(2),
        );
        const parRatio = totalOutstanding > 0
          ? Number((atRiskOutstanding / totalOutstanding).toFixed(4))
          : 0;
        const overdueSnapshot = {
          overdue_installments: overdueInstallments.length,
          overdue_loans: overdueLoanIds.size,
          overdue_amount: Number(overdueInstallments
            .reduce((sum, installment) => sum + Number(installment.amount_due || 0) - Number(installment.amount_paid || 0), 0)
            .toFixed(2)),
        };

        const totalLoans = Number(totals?.total_loans || 0);
        const activeLoans = Number(totals?.active_loans || 0);
        const totalDisbursed = Number(totals?.principal_disbursed || 0);
        const totalCollected = Number(totals?.repaid_total || 0);
        const overdueCount = Number(overdueSnapshot?.overdue_loans || 0);
        const overdueAmount = Number(overdueSnapshot?.overdue_amount || 0);

        const reportPayload: Record<string, any> = {
          period: {
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
          },
          ...(totals || {}),
          total_loans: totalLoans,
          active_loans: activeLoans,
          principal_disbursed: totalDisbursed,
          outstanding_balance: totalOutstanding,
          repaid_total: totalCollected,
          overdue_installments: Number(overdueSnapshot?.overdue_installments || 0),
          overdue_loans: overdueCount,
          overdue_amount: overdueAmount,
          at_risk_balance: atRiskOutstanding,
          totalLoans,
          activeLoans,
          totalDisbursed,
          totalOutstanding,
          totalCollected,
          parRatio,
          overdueCount,
          overdueAmount,
          atRiskOutstanding,
        };

        if (includeBreakdown) {
          const branches = await listBranchesForBreakdown(scope, normalizedBranchFilter);
          const regions = await listRegionsByIds(
            [...new Set(branches.map((branch) => Number(branch.region_id || 0)).filter(Boolean))],
          );
          const regionById = new Map(regions.map((region) => [Number(region.id), region]));

          const loansByBranch = new Map<number, Array<Record<string, any>>>();
          for (const loan of loans) {
            const branchId = Number(loan.branch_id || 0);
            if (!loansByBranch.has(branchId)) {
              loansByBranch.set(branchId, []);
            }
            loansByBranch.get(branchId)?.push(loan);
          }

          const overdueInstallmentsByBranch = new Map<number, number>();
          const loanById = new Map(loans.map((loan) => [Number(loan.id), loan]));
          for (const overdue of overdueInstallments) {
            const loan = loanById.get(Number(overdue.loan_id || 0));
            if (!loan) {
              continue;
            }
            const branchId = Number(loan.branch_id || 0);
            overdueInstallmentsByBranch.set(branchId, Number(overdueInstallmentsByBranch.get(branchId) || 0) + 1);
          }

          const branchBreakdown = branches.map((branch) => {
            const aggregated = aggregateLoanPortfolio(loansByBranch.get(Number(branch.id)) || []);
            return {
              branch_id: Number(branch.id),
              branch_name: branch.name,
              branch_code: branch.code,
              region_id: Number(branch.region_id || 0),
              region_name: regionById.get(Number(branch.region_id || 0))?.name || null,
              ...aggregated,
              overdue_installments: Number(overdueInstallmentsByBranch.get(Number(branch.id)) || 0),
            };
          });

          const regionBreakdownMap = new Map<number, Record<string, any>>();
          for (const branchRow of branchBreakdown) {
            const regionId = Number(branchRow.region_id || 0);
            if (!regionBreakdownMap.has(regionId)) {
              regionBreakdownMap.set(regionId, {
                region_id: regionId,
                region_name: branchRow.region_name,
                branch_count: 0,
                total_loans: 0,
                active_loans: 0,
                restructured_loans: 0,
                written_off_loans: 0,
                principal_disbursed: 0,
                expected_total: 0,
                repaid_total: 0,
                outstanding_balance: 0,
                written_off_balance: 0,
                overdue_installments: 0,
              });
            }
            const regionRow = regionBreakdownMap.get(regionId)!;
            regionRow.branch_count += 1;
            regionRow.total_loans += Number(branchRow.total_loans || 0);
            regionRow.active_loans += Number(branchRow.active_loans || 0);
            regionRow.restructured_loans += Number(branchRow.restructured_loans || 0);
            regionRow.written_off_loans += Number(branchRow.written_off_loans || 0);
            regionRow.principal_disbursed += Number(branchRow.principal_disbursed || 0);
            regionRow.expected_total += Number(branchRow.expected_total || 0);
            regionRow.repaid_total += Number(branchRow.repaid_total || 0);
            regionRow.outstanding_balance += Number(branchRow.outstanding_balance || 0);
            regionRow.written_off_balance += Number(branchRow.written_off_balance || 0);
            regionRow.overdue_installments += Number(branchRow.overdue_installments || 0);
          }

          const regionBreakdown = [...regionBreakdownMap.values()].sort((left, right) => {
            return String(left.region_name || "").localeCompare(String(right.region_name || ""));
          });

          reportPayload.branchBreakdown = branchBreakdown.map((row: Record<string, any>) => ({
            ...row,
            branch_id: Number(row.branch_id),
            region_id: Number(row.region_id),
            total_loans: Number(row.total_loans || 0),
            active_loans: Number(row.active_loans || 0),
            restructured_loans: Number(row.restructured_loans || 0),
            written_off_loans: Number(row.written_off_loans || 0),
            principal_disbursed: Number(row.principal_disbursed || 0),
            expected_total: Number(row.expected_total || 0),
            repaid_total: Number(row.repaid_total || 0),
            outstanding_balance: Number(row.outstanding_balance || 0),
            written_off_balance: Number(row.written_off_balance || 0),
            overdue_installments: Number(row.overdue_installments || 0),
          }));
          reportPayload.regionBreakdown = regionBreakdown.map((row: Record<string, any>) => ({
            ...row,
            region_id: Number(row.region_id),
            branch_count: Number(row.branch_count || 0),
            total_loans: Number(row.total_loans || 0),
            active_loans: Number(row.active_loans || 0),
            restructured_loans: Number(row.restructured_loans || 0),
            written_off_loans: Number(row.written_off_loans || 0),
            principal_disbursed: Number(row.principal_disbursed || 0),
            expected_total: Number(row.expected_total || 0),
            repaid_total: Number(row.repaid_total || 0),
            outstanding_balance: Number(row.outstanding_balance || 0),
            written_off_balance: Number(row.written_off_balance || 0),
            overdue_installments: Number(row.overdue_installments || 0),
          }));
        }

        return reportPayload;
      },
    });
  }

  async function getDisbursementsReport({
    user,
    scope,
    dateFrom,
    dateTo,
    branchFilter,
    officerIdFilter,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    dateFrom: string | null;
    dateTo: string | null;
    branchFilter: number | null;
    officerIdFilter?: number | number[] | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    const normalizedOfficerIds = normalizeOfficerIds(officerIdFilter);

    const cacheKeyPayload = {
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      branchId: branchFilter || null,
      officerIds: normalizedOfficerIds,
    };

    const disbursedLoans = await listDisbursedLoans({
      scope,
      branchFilter,
      officerIds: normalizedOfficerIds,
      dateFrom,
      dateTo,
    });

    const clientIds = [...new Set(disbursedLoans.map((loan) => Number(loan.client_id || 0)).filter(Boolean))];
    const disbursementHistory = clientIds.length > 0
      ? await listHistoricalDisbursements(clientIds)
      : [];

    const repeatLoanIds = new Set(
      disbursedLoans
        .filter((loan) => {
          const loanDisbursedAt = new Date(String(loan.disbursed_at || "")).getTime();
          return disbursementHistory.some((candidate) => {
            if (Number(candidate.client_id || 0) !== Number(loan.client_id || 0)) {
              return false;
            }
            if (Number(candidate.id || 0) === Number(loan.id || 0)) {
              return false;
            }

            const candidateDisbursedAt = new Date(String(candidate.disbursed_at || "")).getTime();
            if (!Number.isFinite(loanDisbursedAt) || !Number.isFinite(candidateDisbursedAt)) {
              return Number(candidate.id || 0) < Number(loan.id || 0);
            }

            return candidateDisbursedAt < loanDisbursedAt
              || (candidateDisbursedAt === loanDisbursedAt && Number(candidate.id || 0) < Number(loan.id || 0));
          });
        })
        .map((loan) => Number(loan.id)),
    );

    const summary = await resolveCachedReport({
      namespace: "reports:disbursements:summary",
      user,
      scope,
      keyPayload: cacheKeyPayload,
      compute: async () => {
        const totalLoans = disbursedLoans.length;
        const repeatClientLoans = disbursedLoans.filter((loan) => repeatLoanIds.has(Number(loan.id))).length;
        const newClientLoans = totalLoans - repeatClientLoans;

        const totalPrincipal = Number(disbursedLoans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0).toFixed(2));
        const newClientPrincipal = Number(
          disbursedLoans
            .filter((loan) => !repeatLoanIds.has(Number(loan.id)))
            .reduce((sum, loan) => sum + Number(loan.principal || 0), 0)
            .toFixed(2),
        );
        const repeatClientPrincipal = Number((totalPrincipal - newClientPrincipal).toFixed(2));
        const totalExpected = Number(disbursedLoans.reduce((sum, loan) => sum + Number(loan.expected_total || 0), 0).toFixed(2));
        const totalRegistrationFees = Number(disbursedLoans.reduce((sum, loan) => sum + Number(loan.registration_fee || 0), 0).toFixed(2));
        const totalProcessingFees = Number(disbursedLoans.reduce((sum, loan) => sum + Number(loan.processing_fee || 0), 0).toFixed(2));
        const avgLoanSize = totalLoans > 0 ? Number((totalPrincipal / totalLoans).toFixed(2)) : 0;
        const avgTermWeeks = totalLoans > 0
          ? Number((disbursedLoans.reduce((sum, loan) => sum + Number(loan.term_weeks || 0), 0) / totalLoans).toFixed(1))
          : 0;
        const uniqueClients = new Set(disbursedLoans.map((loan) => Number(loan.client_id || 0)).filter(Boolean)).size;

        return {
          total_loans: totalLoans,
          new_client_loans: newClientLoans,
          repeat_client_loans: repeatClientLoans,
          total_principal: totalPrincipal,
          new_client_principal: newClientPrincipal,
          repeat_client_principal: repeatClientPrincipal,
          total_expected: totalExpected,
          total_registration_fees: totalRegistrationFees,
          total_processing_fees: totalProcessingFees,
          avg_loan_size: avgLoanSize,
          avg_term_weeks: avgTermWeeks,
          unique_clients: uniqueClients,
        };
      },
    });

    const branchBreakdown = await resolveCachedReport({
      namespace: "reports:disbursements:branch-breakdown",
      user,
      scope,
      keyPayload: cacheKeyPayload,
      compute: async () => {
        const branchIds = [...new Set(disbursedLoans.map((loan) => Number(loan.branch_id || 0)).filter(Boolean))];
        const branchCondition = buildIdListClause("id", branchIds);
        const branches = branchCondition
          ? await readAll(
            `
              SELECT
                id,
                name,
                code,
                region_id
              FROM branches
              WHERE ${branchCondition.sql}
            `,
            branchCondition.params,
          )
          : [];
        const regions = await listRegionsByIds(
          [...new Set(branches.map((branch) => Number(branch.region_id || 0)).filter(Boolean))],
        );
        const regionById = new Map(regions.map((region) => [Number(region.id), region.name]));

        return branches
          .map((branch) => {
            const branchLoans = disbursedLoans.filter((loan) => Number(loan.branch_id || 0) === Number(branch.id));
            const totalLoans = branchLoans.length;
            const totalPrincipal = Number(branchLoans.reduce((sum, loan) => sum + Number(loan.principal || 0), 0).toFixed(2));
            const newClientPrincipal = Number(
              branchLoans
                .filter((loan) => !repeatLoanIds.has(Number(loan.id)))
                .reduce((sum, loan) => sum + Number(loan.principal || 0), 0)
                .toFixed(2),
            );
            const totalRegistrationFees = Number(
              branchLoans.reduce((sum, loan) => sum + Number(loan.registration_fee || 0), 0).toFixed(2),
            );
            const totalProcessingFees = Number(
              branchLoans.reduce((sum, loan) => sum + Number(loan.processing_fee || 0), 0).toFixed(2),
            );

            return {
              branch_id: Number(branch.id),
              branch_name: branch.name,
              branch_code: branch.code,
              region_name: regionById.get(Number(branch.region_id || 0)) || null,
              total_loans: totalLoans,
              new_client_loans: branchLoans.filter((loan) => !repeatLoanIds.has(Number(loan.id))).length,
              repeat_client_loans: branchLoans.filter((loan) => repeatLoanIds.has(Number(loan.id))).length,
              total_principal: totalPrincipal,
              new_client_principal: newClientPrincipal,
              repeat_client_principal: Number((totalPrincipal - newClientPrincipal).toFixed(2)),
              total_expected: Number(branchLoans.reduce((sum, loan) => sum + Number(loan.expected_total || 0), 0).toFixed(2)),
              total_registration_fees: totalRegistrationFees,
              total_processing_fees: totalProcessingFees,
              total_fees: Number((totalRegistrationFees + totalProcessingFees).toFixed(2)),
              avg_loan_size: totalLoans > 0 ? Number((totalPrincipal / totalLoans).toFixed(2)) : 0,
              unique_clients: new Set(branchLoans.map((loan) => Number(loan.client_id || 0)).filter(Boolean)).size,
            };
          })
          .sort((left, right) => {
            const regionSort = String(left.region_name || "").localeCompare(String(right.region_name || ""));
            if (regionSort !== 0) {
              return regionSort;
            }
            return String(left.branch_name || "").localeCompare(String(right.branch_name || ""));
          });
      },
    });

    return {
      period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
      summary,
      branchBreakdown,
    };
  }

  // ─── Gap 8: new reports ───────────────────────────────────────────────────

  /**
   * Collections / arrears aging report.
   *
   * Groups overdue outstanding balances into four standard aging buckets:
   *   1–30 days, 31–60 days, 61–90 days, 91+ days past due.
   *
   * Each bucket contains the count of affected loans, the number of
   * affected clients, and the aggregate outstanding arrears value.
   * A per-branch breakdown is also included so managers can identify
   * high-risk branches quickly.
   */
  async function getCollectionsArrearsAgingReport({
    user,
    scope,
    branchFilter,
    overdueAsOf,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    branchFilter?: number | null;
    overdueAsOf?: string | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    const asOf = normalizeOverdueAsOf(overdueAsOf);

    return resolveCachedReport({
      namespace: "reports:aging",
      user,
      scope,
      keyPayload: { branchId: branchFilter || null, overdueAsOf: asOf },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const branchClause = branchFilter ? `AND l.branch_id = ${Number(branchFilter)}` : "";

        // One row per overdue installment with how many calendar days it is past due
        const tenantId = getCurrentTenantId();
        const rows = await readAll(
          `
            SELECT
              l.id          AS loan_id,
              l.client_id,
              l.branch_id,
              l.officer_id,
              COALESCE(l.balance, 0) AS outstanding_balance,
              CAST(
                (julianday(?) - julianday(li.due_date))
              AS INTEGER) AS days_past_due,
              COALESCE(li.amount_due, 0) - COALESCE(li.amount_paid, 0) AS arrears_amount
            FROM loan_installments li
            INNER JOIN loans l ON l.id = li.loan_id
            ${scopeCond.sql ? `WHERE (${scopeCond.sql}) ${branchClause}` : `WHERE 1=1 ${branchClause}`}
              AND l.tenant_id = ?
              AND l.status IN ('active', 'restructured', 'overdue')
              AND LOWER(COALESCE(li.status, '')) <> 'paid'
              AND datetime(li.due_date) < datetime(?)
          `,
          [...scopeCond.params, asOf, tenantId, asOf],
        );

        // Bucket boundaries
        const BUCKETS = [
          { label: "1_30_days",  min: 1,  max: 30  },
          { label: "31_60_days", min: 31, max: 60  },
          { label: "61_90_days", min: 61, max: 90  },
          { label: "91_plus_days", min: 91, max: Infinity },
        ];

        type BucketAgg = {
          loans: Set<number>;
          clients: Set<number>;
          arrears_amount: number;
          outstanding_balance: number;
        };

        const globalBuckets = new Map<string, BucketAgg>(
          BUCKETS.map((b) => [b.label, { loans: new Set(), clients: new Set(), arrears_amount: 0, outstanding_balance: 0 }]),
        );

        const branchBuckets = new Map<number, Map<string, BucketAgg>>();

        for (const row of rows) {
          const dpd = Number(row["days_past_due"] || 0);
          const bucket = BUCKETS.find((b) => dpd >= b.min && dpd <= b.max);
          if (!bucket) continue;

          const loanId   = Number(row["loan_id"]);
          const clientId = Number(row["client_id"]);
          const branchId = Number(row["branch_id"]);
          const arrears  = Number(row["arrears_amount"] || 0);
          const balance  = Number(row["outstanding_balance"] || 0);

          const gb = globalBuckets.get(bucket.label)!;
          const firstTimeInBucket = !gb.loans.has(loanId);
          gb.loans.add(loanId);
          gb.clients.add(clientId);
          gb.arrears_amount += arrears;
          if (firstTimeInBucket) gb.outstanding_balance += balance;

          if (!branchBuckets.has(branchId)) {
            branchBuckets.set(branchId, new Map(
              BUCKETS.map((b) => [b.label, { loans: new Set(), clients: new Set(), arrears_amount: 0, outstanding_balance: 0 }]),
            ));
          }
          const bb = branchBuckets.get(branchId)!.get(bucket.label)!;
          const firstTimeInBranchBucket = !bb.loans.has(loanId);
          bb.loans.add(loanId);
          bb.clients.add(clientId);
          bb.arrears_amount += arrears;
          if (firstTimeInBranchBucket) bb.outstanding_balance += balance;
        }

        const serializeBuckets = (bucketMap: Map<string, BucketAgg>) =>
          Object.fromEntries(
            BUCKETS.map((b) => {
              const agg = bucketMap.get(b.label)!;
              return [b.label, {
                loan_count:          agg.loans.size,
                client_count:        agg.clients.size,
                arrears_amount:      Number(agg.arrears_amount.toFixed(2)),
                outstanding_balance: Number(agg.outstanding_balance.toFixed(2)),
              }];
            }),
          );

        // Fetch branch names for breakdown
        const branchIds = [...branchBuckets.keys()];
        const branchCond = buildIdListClause("id", branchIds);
        const branches = branchCond
          ? await readAll(`SELECT id, name, code FROM branches WHERE ${branchCond.sql}`, branchCond.params)
          : [];
        const branchNameById = new Map(branches.map((b) => [Number(b["id"]), { name: b["name"], code: b["code"] }]));

        const branchBreakdown = branchIds
          .map((branchId) => ({
            branch_id:   branchId,
            branch_name: branchNameById.get(branchId)?.name ?? null,
            branch_code: branchNameById.get(branchId)?.code ?? null,
            buckets:     serializeBuckets(branchBuckets.get(branchId)!),
          }))
          .sort((a, b) => String(a.branch_name || "").localeCompare(String(b.branch_name || "")));

        const totals = (() => {
          let totalLoans = new Set<number>();
          let totalClients = new Set<number>();
          let totalArrears = 0;
          let totalOutstanding = 0;
          for (const agg of globalBuckets.values()) {
            agg.loans.forEach((id) => totalLoans.add(id));
            agg.clients.forEach((id) => totalClients.add(id));
            totalArrears += agg.arrears_amount;
            totalOutstanding += agg.outstanding_balance;
          }
          return {
            total_overdue_loans:   totalLoans.size,
            total_overdue_clients: totalClients.size,
            total_arrears_amount:  Number(totalArrears.toFixed(2)),
            total_outstanding:     Number(totalOutstanding.toFixed(2)),
          };
        })();

        return {
          as_of: asOf,
          totals,
          buckets: serializeBuckets(globalBuckets),
          branch_breakdown: branchBreakdown,
        };
      },
    });
  }

  /**
   * Officer performance report.
   *
   * For each loan officer in scope, computes:
   *   - Total loans disbursed (count + principal) in the period
   *   - Active portfolio (outstanding balance)
   *   - Collections (repaid total in period)
   *   - PAR (portfolio-at-risk ratio)
   *   - Overdue loan count and overdue balance
   *
   * Supports date range filtering and branch/scope filtering.
   */
  async function getOfficerPerformanceReport({
    user,
    scope,
    branchFilter,
    officerIdFilter,
    dateFrom,
    dateTo,
    overdueAsOf,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    branchFilter?: number | null;
    officerIdFilter?: number | number[] | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    overdueAsOf?: string | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    const normalizedOfficerIds = normalizeOfficerIds(officerIdFilter);
    const asOf = normalizeOverdueAsOf(overdueAsOf, dateTo);

    return resolveCachedReport({
      namespace: "reports:officer-performance",
      user,
      scope,
      keyPayload: {
        branchId: branchFilter || null,
        officerIds: normalizedOfficerIds,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        overdueAsOf: asOf,
      },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const branchClause = branchFilter ? `AND l.branch_id = ${Number(branchFilter)}` : "";
        const officerClause = normalizedOfficerIds.length > 0
          ? `AND l.officer_id IN (${normalizedOfficerIds.map(() => "?").join(",")})`
          : "";

        // Per-officer loan aggregates
        const officerRows = await readAll(
          `
            SELECT
              u.id                                    AS officer_id,
              u.full_name                             AS officer_name,
              u.email                                 AS officer_email,
              COALESCE(u.branch_id, l.branch_id)     AS branch_id,
              COUNT(DISTINCT CASE WHEN l.disbursed_at IS NOT NULL
                AND (? IS NULL OR datetime(l.disbursed_at) >= datetime(?))
                AND (? IS NULL OR datetime(l.disbursed_at) <= datetime(?))
                THEN l.id END)                        AS disbursed_loans,
              ROUND(COALESCE(SUM(CASE WHEN l.disbursed_at IS NOT NULL
                AND (? IS NULL OR datetime(l.disbursed_at) >= datetime(?))
                AND (? IS NULL OR datetime(l.disbursed_at) <= datetime(?))
                THEN l.principal ELSE 0 END), 0), 2) AS disbursed_principal,
              COUNT(DISTINCT CASE WHEN l.status IN ('active','restructured','overdue')
                THEN l.id END)                        AS active_loans,
              ROUND(COALESCE(SUM(CASE WHEN l.status IN ('active','restructured','overdue')
                THEN l.balance ELSE 0 END), 0), 2)   AS outstanding_balance,
              ROUND(COALESCE(SUM(
                (SELECT COALESCE(SUM(r.applied_amount),0) FROM repayments r
                 WHERE r.loan_id = l.id
                   AND (? IS NULL OR datetime(r.repaid_at) >= datetime(?))
                   AND (? IS NULL OR datetime(r.repaid_at) <= datetime(?)))
              ), 0), 2)                               AS collected_in_period,
              COUNT(DISTINCT CASE WHEN l.status = 'written_off' THEN l.id END) AS written_off_loans,
              ROUND(COALESCE(SUM(CASE WHEN l.status = 'written_off'
                THEN l.balance ELSE 0 END), 0), 2)   AS written_off_balance
            FROM users u
            LEFT JOIN loans l
                   ON l.officer_id = u.id
                  AND l.tenant_id = getCurrentTenantId()
                  ${scopeCond.sql ? `AND (${scopeCond.sql})` : ""}
                  ${branchClause}
            WHERE u.role = 'loan_officer'
              AND u.tenant_id = getCurrentTenantId()
              ${officerClause}
            GROUP BY u.id
            ORDER BY u.full_name ASC
          `,
          [
            dateFrom, dateFrom, dateTo, dateTo,
            dateFrom, dateFrom, dateTo, dateTo,
            dateFrom, dateFrom, dateTo, dateTo,
            ...scopeCond.params,
            ...normalizedOfficerIds,
          ],
        );

        // Overdue installments per officer
        const officerIdsInResult = officerRows.map((r) => Number(r["officer_id"])).filter(Boolean);
        const overdueByOfficer = new Map<number, { loans: Set<number>; amount: number }>();

        if (officerIdsInResult.length > 0) {
          const overdueRows = await readAll(
            `
              SELECT
                l.officer_id,
                l.id AS loan_id,
                COALESCE(li.amount_due, 0) - COALESCE(li.amount_paid, 0) AS arrears
              FROM loan_installments li
              INNER JOIN loans l ON l.id = li.loan_id
              WHERE l.officer_id IN (${officerIdsInResult.map(() => "?").join(",")})
                AND l.tenant_id = getCurrentTenantId()
                AND l.status IN ('active','restructured','overdue')
                AND LOWER(COALESCE(li.status,'')) <> 'paid'
                AND datetime(li.due_date) < datetime(?)
            `,
            [...officerIdsInResult, asOf],
          );

          for (const row of overdueRows) {
            const officerId = Number(row["officer_id"]);
            if (!overdueByOfficer.has(officerId)) {
              overdueByOfficer.set(officerId, { loans: new Set(), amount: 0 });
            }
            const entry = overdueByOfficer.get(officerId)!;
            entry.loans.add(Number(row["loan_id"]));
            entry.amount += Number(row["arrears"] || 0);
          }
        }

        const officers = officerRows.map((row) => {
          const officerId = Number(row["officer_id"]);
          const overdue = overdueByOfficer.get(officerId);
          const outstanding = Number(row["outstanding_balance"] || 0);
          const overdueBal = Number((overdue?.amount ?? 0).toFixed(2));
          return {
            officer_id:           officerId,
            officer_name:         row["officer_name"],
            officer_email:        row["officer_email"],
            branch_id:            Number(row["branch_id"] || 0),
            disbursed_loans:      Number(row["disbursed_loans"] || 0),
            disbursed_principal:  Number(row["disbursed_principal"] || 0),
            active_loans:         Number(row["active_loans"] || 0),
            outstanding_balance:  outstanding,
            collected_in_period:  Number(row["collected_in_period"] || 0),
            written_off_loans:    Number(row["written_off_loans"] || 0),
            written_off_balance:  Number(row["written_off_balance"] || 0),
            overdue_loans:        overdue?.loans.size ?? 0,
            overdue_arrears:      overdueBal,
            par_ratio:            outstanding > 0
              ? Number((overdueBal / outstanding).toFixed(4))
              : 0,
          };
        });

        const summary = officers.reduce(
          (acc, o) => {
            acc.total_officers += 1;
            acc.total_disbursed_loans += o.disbursed_loans;
            acc.total_disbursed_principal += o.disbursed_principal;
            acc.total_active_loans += o.active_loans;
            acc.total_outstanding_balance += o.outstanding_balance;
            acc.total_collected_in_period += o.collected_in_period;
            acc.total_overdue_loans += o.overdue_loans;
            acc.total_overdue_arrears += o.overdue_arrears;
            return acc;
          },
          {
            total_officers: 0,
            total_disbursed_loans: 0,
            total_disbursed_principal: 0,
            total_active_loans: 0,
            total_outstanding_balance: 0,
            total_collected_in_period: 0,
            total_overdue_loans: 0,
            total_overdue_arrears: 0,
          },
        );

        return {
          period:  { dateFrom: dateFrom || null, dateTo: dateTo || null },
          as_of:   asOf,
          summary: {
            ...summary,
            total_disbursed_principal:  Number(summary.total_disbursed_principal.toFixed(2)),
            total_outstanding_balance:  Number(summary.total_outstanding_balance.toFixed(2)),
            total_collected_in_period:  Number(summary.total_collected_in_period.toFixed(2)),
            total_overdue_arrears:      Number(summary.total_overdue_arrears.toFixed(2)),
          },
          officers,
        };
      },
    });
  }

  /**
   * Branch P&L / income statement.
   *
   * Income:
   *   - Interest earned (expected_total - principal) on closed + active loans
   *   - Registration fees + processing fees collected in period
   *   - Penalty income accrued in period (from loan_installments)
   *
   * Expenses / provisions:
   *   - Write-off amounts (principal lost)
   *   - Provision for credit loss (outstanding balance of overdue loans)
   *
   * Net income = interest + fees + penalties - write-offs - provision
   */
  async function getBranchPnLReport({
    user,
    scope,
    branchFilter,
    dateFrom,
    dateTo,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    branchFilter?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    return resolveCachedReport({
      namespace: "reports:branch-pnl",
      user,
      scope,
      keyPayload: { branchId: branchFilter || null, dateFrom: dateFrom || null, dateTo: dateTo || null },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const branchClause = branchFilter ? `AND l.branch_id = ${Number(branchFilter)}` : "";

        const tenantId = getCurrentTenantId();
        const loanRows = await readAll(
          `
            SELECT
              l.id,
              l.branch_id,
              l.status,
              COALESCE(l.principal, 0)          AS principal,
              COALESCE(l.expected_total, 0)      AS expected_total,
              COALESCE(l.registration_fee, 0)    AS registration_fee,
              COALESCE(l.processing_fee, 0)      AS processing_fee,
              COALESCE(l.balance, 0)             AS balance,
              COALESCE((
                SELECT SUM(r.applied_amount) FROM repayments r WHERE r.loan_id = l.id
                  AND (? IS NULL OR datetime(r.repaid_at) >= datetime(?))
                  AND (? IS NULL OR datetime(r.repaid_at) <= datetime(?))
              ), 0)                              AS collected_in_period
            FROM loans l
            ${scopeCond.sql ? `WHERE (${scopeCond.sql}) ${branchClause}` : `WHERE 1=1 ${branchClause}`}
              AND l.tenant_id = ?
              AND (l.disbursed_at IS NOT NULL)
              AND (? IS NULL OR datetime(l.disbursed_at) >= datetime(?))
              AND (? IS NULL OR datetime(l.disbursed_at) <= datetime(?))
          `,
          [
            dateFrom, dateFrom, dateTo, dateTo,
            ...scopeCond.params,
            tenantId,
            dateFrom, dateFrom, dateTo, dateTo,
          ],
        );

        // Penalty income
        const penaltyRows = await readAll(
          `
            SELECT li.loan_id, COALESCE(SUM(li.penalty_amount_accrued), 0) AS penalty_income
            FROM loan_installments li
            INNER JOIN loans l ON l.id = li.loan_id
            ${scopeCond.sql ? `WHERE (${scopeCond.sql}) ${branchClause}` : `WHERE 1=1 ${branchClause}`}
              AND li.penalty_amount_accrued > 0
            GROUP BY li.loan_id
          `,
          scopeCond.params,
        ).catch(() => [] as Array<Record<string, any>>); // penalty column may not exist on all schemas

        const penaltyByLoan = new Map(penaltyRows.map((r) => [Number(r["loan_id"]), Number(r["penalty_income"] || 0)]));

        const branchAggMap = new Map<number, {
          interest_income: number;
          fee_income: number;
          penalty_income: number;
          write_off_amount: number;
          provision_for_credit_loss: number;
          collected_in_period: number;
          loan_count: number;
        }>();

        for (const row of loanRows) {
          const branchId = Number(row["branch_id"] || 0);
          if (!branchAggMap.has(branchId)) {
            branchAggMap.set(branchId, {
              interest_income: 0, fee_income: 0, penalty_income: 0,
              write_off_amount: 0, provision_for_credit_loss: 0,
              collected_in_period: 0, loan_count: 0,
            });
          }
          const agg = branchAggMap.get(branchId)!;
          const status    = String(row["status"] || "").toLowerCase();
          const principal = Number(row["principal"] || 0);
          const expected  = Number(row["expected_total"] || 0);
          const balance   = Number(row["balance"] || 0);

          agg.loan_count += 1;
          agg.interest_income += Math.max(0, expected - principal);
          agg.fee_income += Number(row["registration_fee"] || 0) + Number(row["processing_fee"] || 0);
          agg.penalty_income += penaltyByLoan.get(Number(row["id"])) ?? 0;
          agg.collected_in_period += Number(row["collected_in_period"] || 0);

          if (status === "written_off") {
            agg.write_off_amount += principal;
          }
          if (["overdue", "restructured"].includes(status)) {
            agg.provision_for_credit_loss += balance;
          }
        }

        // Fetch branch + region metadata for the branches we saw
        const branchIds = [...branchAggMap.keys()];
        const branchCond = buildIdListClause("b.id", branchIds);
        const branchMeta = branchCond
          ? await readAll(
            `SELECT b.id, b.name, b.code, r.name AS region_name
             FROM branches b LEFT JOIN regions r ON r.id = b.region_id
             WHERE ${branchCond.sql}`,
            branchCond.params,
          )
          : [];
        const metaById = new Map(branchMeta.map((b) => [Number(b["id"]), b]));

        const branches = branchIds.map((branchId) => {
          const agg  = branchAggMap.get(branchId)!;
          const meta = metaById.get(branchId);
          const grossIncome = agg.interest_income + agg.fee_income + agg.penalty_income;
          const totalExpenses = agg.write_off_amount + agg.provision_for_credit_loss;
          return {
            branch_id:               branchId,
            branch_name:             meta?.["name"] ?? null,
            branch_code:             meta?.["code"] ?? null,
            region_name:             meta?.["region_name"] ?? null,
            loan_count:              agg.loan_count,
            interest_income:         Number(agg.interest_income.toFixed(2)),
            fee_income:              Number(agg.fee_income.toFixed(2)),
            penalty_income:          Number(agg.penalty_income.toFixed(2)),
            gross_income:            Number(grossIncome.toFixed(2)),
            write_off_amount:        Number(agg.write_off_amount.toFixed(2)),
            provision_credit_loss:   Number(agg.provision_for_credit_loss.toFixed(2)),
            total_expenses:          Number(totalExpenses.toFixed(2)),
            net_income:              Number((grossIncome - totalExpenses).toFixed(2)),
            collected_in_period:     Number(agg.collected_in_period.toFixed(2)),
          };
        }).sort((a, b) => String(a.region_name || "").localeCompare(String(b.region_name || "")));

        // Roll up totals
        const totals = branches.reduce(
          (acc, b) => {
            acc.interest_income       += b.interest_income;
            acc.fee_income            += b.fee_income;
            acc.penalty_income        += b.penalty_income;
            acc.gross_income          += b.gross_income;
            acc.write_off_amount      += b.write_off_amount;
            acc.provision_credit_loss += b.provision_credit_loss;
            acc.total_expenses        += b.total_expenses;
            acc.net_income            += b.net_income;
            acc.collected_in_period   += b.collected_in_period;
            return acc;
          },
          {
            interest_income: 0, fee_income: 0, penalty_income: 0,
            gross_income: 0, write_off_amount: 0, provision_credit_loss: 0,
            total_expenses: 0, net_income: 0, collected_in_period: 0,
          },
        );

        return {
          period:   { dateFrom: dateFrom || null, dateTo: dateTo || null },
          totals:   Object.fromEntries(
            Object.entries(totals).map(([k, v]) => [k, Number(v.toFixed(2))]),
          ),
          branches,
        };
      },
    });
  }

  /**
   * Write-off report.
   *
   * Lists all loans that have been written off, with the original principal,
   * the amount recovered (repaid_total), the net loss, the date written off,
   * and the responsible officer and branch.
   *
   * Supports date range filtering on the write-off date.
   */
  async function getWriteOffReport({
    user,
    scope,
    branchFilter,
    officerIdFilter,
    dateFrom,
    dateTo,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    branchFilter?: number | null;
    officerIdFilter?: number | number[] | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    const normalizedOfficerIds = normalizeOfficerIds(officerIdFilter);

    return resolveCachedReport({
      namespace: "reports:write-offs",
      user,
      scope,
      keyPayload: {
        branchId: branchFilter || null,
        officerIds: normalizedOfficerIds,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const branchClause = branchFilter ? `AND l.branch_id = ${Number(branchFilter)}` : "";
        const officerClause = normalizedOfficerIds.length > 0
          ? `AND l.officer_id IN (${normalizedOfficerIds.map(() => "?").join(",")})`
          : "";

        const tenantId = getCurrentTenantId();
        const rows = await readAll(
          `
            SELECT
              l.id                                       AS loan_id,
              l.client_id,
              l.branch_id,
              l.officer_id,
              COALESCE(l.principal, 0)                   AS principal,
              COALESCE(l.repaid_total, 0)                AS repaid_total,
              COALESCE(l.balance, 0)                     AS net_loss,
              l.updated_at                               AS written_off_at,
              b.name                                     AS branch_name,
              u.full_name                                AS officer_name,
              c.full_name                                AS client_name
            FROM loans l
            LEFT JOIN branches b  ON b.id = l.branch_id
            LEFT JOIN users u     ON u.id = l.officer_id
            LEFT JOIN clients c   ON c.id = l.client_id
            ${scopeCond.sql ? `WHERE (${scopeCond.sql}) ${branchClause}` : `WHERE 1=1 ${branchClause}`}
              AND l.tenant_id = ?
              AND l.status = 'written_off'
              ${officerClause}
              AND (? IS NULL OR datetime(l.updated_at) >= datetime(?))
              AND (? IS NULL OR datetime(l.updated_at) <= datetime(?))
            ORDER BY l.updated_at DESC
          `,
          [
            ...scopeCond.params,
            tenantId,
            ...normalizedOfficerIds,
            dateFrom, dateFrom,
            dateTo,   dateTo,
          ],
        );

        const loans = rows.map((row) => ({
          loan_id:        Number(row["loan_id"]),
          client_id:      Number(row["client_id"]),
          client_name:    row["client_name"] ?? null,
          branch_id:      Number(row["branch_id"] || 0),
          branch_name:    row["branch_name"] ?? null,
          officer_id:     row["officer_id"] != null ? Number(row["officer_id"]) : null,
          officer_name:   row["officer_name"] ?? null,
          principal:      Number(row["principal"]),
          repaid_total:   Number(row["repaid_total"]),
          net_loss:       Number(row["net_loss"]),
          written_off_at: row["written_off_at"] ?? null,
        }));

        const summary = loans.reduce(
          (acc, l) => {
            acc.total_write_offs += 1;
            acc.total_principal_written_off += l.principal;
            acc.total_recovered += l.repaid_total;
            acc.total_net_loss += l.net_loss;
            return acc;
          },
          { total_write_offs: 0, total_principal_written_off: 0, total_recovered: 0, total_net_loss: 0 },
        );

        return {
          period: { dateFrom: dateFrom || null, dateTo: dateTo || null },
          summary: {
            total_write_offs:             summary.total_write_offs,
            total_principal_written_off:  Number(summary.total_principal_written_off.toFixed(2)),
            total_recovered:              Number(summary.total_recovered.toFixed(2)),
            total_net_loss:               Number(summary.total_net_loss.toFixed(2)),
            recovery_rate:                summary.total_principal_written_off > 0
              ? Number((summary.total_recovered / summary.total_principal_written_off).toFixed(4))
              : 0,
          },
          loans,
        };
      },
    });
  }

  /**
   * Capital adequacy report.
   *
   * Produces a simplified capital adequacy snapshot:
   *   - Total portfolio (gross book value of all disbursed loans)
   *   - Portfolio at risk (PAR30 — outstanding balance of loans with 30+ day arrears)
   *   - Provision for credit loss (outstanding balance of overdue + restructured loans)
   *   - Written-off balance (total net loss on written-off loans)
   *   - PAR30 ratio, PAR90 ratio
   *   - Write-off rate (written-off principal / total disbursed principal)
   *
   * This is intentionally a high-level snapshot. A full capital adequacy
   * calculation requires regulatory parameters (tier-1 capital, RWA weights)
   * that are institution-specific and are not stored in the database. This
   * report provides the portfolio-side inputs for that calculation.
   */
  async function getCapitalAdequacyReport({
    user,
    scope,
    overdueAsOf,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    overdueAsOf?: string | null;
  }) {
    const asOf = normalizeOverdueAsOf(overdueAsOf);

    return resolveCachedReport({
      namespace: "reports:capital-adequacy",
      user,
      scope,
      keyPayload: { overdueAsOf: asOf },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");

        const tenantId = getCurrentTenantId();
        const portfolioRow = await deps.get(
          `
            SELECT
              COUNT(DISTINCT l.id)                                           AS total_loans,
              ROUND(COALESCE(SUM(l.principal), 0), 2)                       AS total_principal_disbursed,
              ROUND(COALESCE(SUM(CASE WHEN l.status IN ('active','restructured','overdue')
                THEN l.balance ELSE 0 END), 0), 2)                          AS gross_outstanding,
              ROUND(COALESCE(SUM(CASE WHEN l.status = 'written_off'
                THEN l.principal ELSE 0 END), 0), 2)                        AS written_off_principal,
              ROUND(COALESCE(SUM(CASE WHEN l.status = 'written_off'
                THEN l.balance ELSE 0 END), 0), 2)                          AS written_off_net_loss,
              ROUND(COALESCE(SUM(CASE WHEN l.status IN ('overdue','restructured')
                THEN l.balance ELSE 0 END), 0), 2)                          AS provision_pool
            FROM loans l
            ${scopeCond.sql ? `WHERE (${scopeCond.sql})` : "WHERE 1=1"}
              AND l.tenant_id = ?
              AND l.disbursed_at IS NOT NULL
          `,
          [...scopeCond.params, tenantId],
        );

        // PAR30 and PAR90: loans with at least one installment 30+ / 90+ days overdue
        const parRows = await readAll(
          `
            SELECT
              l.id AS loan_id,
              COALESCE(l.balance, 0) AS balance,
              MAX(CAST((julianday(?) - julianday(li.due_date)) AS INTEGER)) AS max_dpd
            FROM loan_installments li
            INNER JOIN loans l ON l.id = li.loan_id
            ${scopeCond.sql ? `WHERE (${scopeCond.sql})` : "WHERE 1=1"}
              AND l.tenant_id = ?
              AND l.status IN ('active','restructured','overdue')
              AND LOWER(COALESCE(li.status,'')) <> 'paid'
              AND datetime(li.due_date) < datetime(?)
            GROUP BY l.id
          `,
          [asOf, ...scopeCond.params, tenantId, asOf],
        );

        let par30Balance = 0;
        let par90Balance = 0;
        for (const row of parRows) {
          const dpd = Number(row["max_dpd"] || 0);
          const bal = Number(row["balance"] || 0);
          if (dpd >= 30) par30Balance += bal;
          if (dpd >= 90) par90Balance += bal;
        }

        const grossOutstanding = Number(portfolioRow?.["gross_outstanding"] || 0);
        const totalPrincipal   = Number(portfolioRow?.["total_principal_disbursed"] || 0);

        return {
          as_of: asOf,
          total_loans:             Number(portfolioRow?.["total_loans"] || 0),
          total_principal_disbursed: totalPrincipal,
          gross_outstanding:         grossOutstanding,
          provision_pool:            Number(portfolioRow?.["provision_pool"] || 0),
          written_off_principal:     Number(portfolioRow?.["written_off_principal"] || 0),
          written_off_net_loss:      Number(portfolioRow?.["written_off_net_loss"] || 0),
          par30_balance:             Number(par30Balance.toFixed(2)),
          par90_balance:             Number(par90Balance.toFixed(2)),
          par30_ratio:               grossOutstanding > 0
            ? Number((par30Balance / grossOutstanding).toFixed(4))
            : 0,
          par90_ratio:               grossOutstanding > 0
            ? Number((par90Balance / grossOutstanding).toFixed(4))
            : 0,
          write_off_rate:            totalPrincipal > 0
            ? Number((Number(portfolioRow?.["written_off_principal"] || 0) / totalPrincipal).toFixed(4))
            : 0,
        };
      },
    });
  }

  /**
   * Client retention / graduation report.
   *
   * For each loan cycle (1st, 2nd, 3rd, 4th+), computes:
   *   - Number of clients in that cycle
   *   - Average loan size vs previous cycle
   *   - Retention rate (clients who came back for the next cycle)
   *   - Dropout rate (clients who did not return within the period)
   *
   * "Cycle" is determined by counting historical disbursements per client.
   * A client with 1 total disbursement is on cycle 1; 2 disbursements = cycle 2, etc.
   *
   * Supports date range filtering on the current loan's disbursement date.
   */
  async function getClientRetentionReport({
    user,
    scope,
    branchFilter,
    dateFrom,
    dateTo,
  }: {
    user: Record<string, any> | undefined;
    scope: unknown;
    branchFilter?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
  }) {
    if (branchFilter && !hierarchyService.isBranchInScope(scope, branchFilter)) {
      throw new ForbiddenScopeError("Forbidden: branchId is outside your scope.");
    }

    return resolveCachedReport({
      namespace: "reports:client-retention",
      user,
      scope,
      keyPayload: {
        branchId: branchFilter || null,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
      },
      compute: async () => {
        const scopeCond = hierarchyService.buildScopeCondition(scope, "l.branch_id");
        const branchClause = branchFilter ? `AND l.branch_id = ${Number(branchFilter)}` : "";

        // Count total disbursements per client across all time (for cycle number)
        // and disbursements within the requested period (for the cohort analysis)
        const tenantId = getCurrentTenantId();
        const clientRows = await readAll(
          `
            SELECT
              c.id                                    AS client_id,
              c.full_name                             AS client_name,
              c.branch_id,
              COUNT(all_l.id)                         AS total_loans_ever,
              COUNT(period_l.id)                      AS loans_in_period,
              ROUND(COALESCE(AVG(period_l.principal), 0), 2) AS avg_loan_size_in_period
            FROM clients c
            LEFT JOIN loans all_l
                   ON all_l.client_id = c.id
                  AND all_l.tenant_id = ?
                  AND all_l.disbursed_at IS NOT NULL
            LEFT JOIN loans period_l
                   ON period_l.client_id = c.id
                  AND period_l.tenant_id = ?
                  AND period_l.disbursed_at IS NOT NULL
                  ${scopeCond.sql ? `AND (${scopeCond.sql.replace(/l\.branch_id/g, "period_l.branch_id")})` : ""}
                  ${branchClause.replace(/l\.branch_id/g, "period_l.branch_id")}
                  AND (? IS NULL OR datetime(period_l.disbursed_at) >= datetime(?))
                  AND (? IS NULL OR datetime(period_l.disbursed_at) <= datetime(?))
            WHERE c.tenant_id = ?
              AND c.id IN (
              SELECT DISTINCT client_id FROM loans
              WHERE tenant_id = ?
                AND disbursed_at IS NOT NULL
                ${scopeCond.sql ? `AND (${scopeCond.sql})` : ""}
                ${branchClause}
                AND (? IS NULL OR datetime(disbursed_at) >= datetime(?))
                AND (? IS NULL OR datetime(disbursed_at) <= datetime(?))
            )
            GROUP BY c.id
          `,
          [
            tenantId, tenantId,
            dateFrom, dateFrom, dateTo, dateTo,
            ...scopeCond.params,
            tenantId, tenantId,
            ...scopeCond.params,
            dateFrom, dateFrom, dateTo, dateTo,
          ],
        );

        // Group clients by cycle bucket (cycle = total_loans_ever at time of last loan in period)
        const CYCLE_LABELS = ["cycle_1", "cycle_2", "cycle_3", "cycle_4_plus"] as const;

        type CycleAgg = {
          clients: number;
          total_loan_size: number;
          returned_next: number; // proxy: loans_in_period > 1 OR total_loans_ever > cycle
        };

        const cycleAgg = new Map<string, CycleAgg>(
          CYCLE_LABELS.map((l) => [l, { clients: 0, total_loan_size: 0, returned_next: 0 }]),
        );

        for (const row of clientRows) {
          const totalEver   = Number(row["total_loans_ever"] || 0);
          const inPeriod    = Number(row["loans_in_period"] || 0);
          if (inPeriod === 0) continue; // client had no loans in the requested period

          const cycleLabel = totalEver === 1 ? "cycle_1"
            : totalEver === 2 ? "cycle_2"
            : totalEver === 3 ? "cycle_3"
            : "cycle_4_plus";

          const agg = cycleAgg.get(cycleLabel)!;
          agg.clients += 1;
          agg.total_loan_size += Number(row["avg_loan_size_in_period"] || 0);
          // "returned" = has more than 1 loan in period, or has loans after the period
          if (inPeriod > 1 || totalEver > (
            cycleLabel === "cycle_1" ? 1
            : cycleLabel === "cycle_2" ? 2
            : cycleLabel === "cycle_3" ? 3 : 4
          )) {
            agg.returned_next += 1;
          }
        }

        const cycles = CYCLE_LABELS.map((label) => {
          const agg = cycleAgg.get(label)!;
          return {
            cycle:          label,
            client_count:   agg.clients,
            avg_loan_size:  agg.clients > 0 ? Number((agg.total_loan_size / agg.clients).toFixed(2)) : 0,
            returned_count: agg.returned_next,
            dropout_count:  agg.clients - agg.returned_next,
            retention_rate: agg.clients > 0
              ? Number((agg.returned_next / agg.clients).toFixed(4))
              : 0,
          };
        });

        const totalClients = cycles.reduce((s, c) => s + c.client_count, 0);
        const totalReturned = cycles.reduce((s, c) => s + c.returned_count, 0);

        return {
          period:           { dateFrom: dateFrom || null, dateTo: dateTo || null },
          total_clients:    totalClients,
          overall_retention_rate: totalClients > 0
            ? Number((totalReturned / totalClients).toFixed(4))
            : 0,
          cycles,
        };
      },
    });
  }

  return {
    getPortfolioReport,
    getDisbursementsReport,
    // Gap 8 — new reports
    getCollectionsArrearsAgingReport,
    getOfficerPerformanceReport,
    getBranchPnLReport,
    getWriteOffReport,
    getCapitalAdequacyReport,
    getClientRetentionReport,
  };
}

export {
  createReportQueryService,
};
