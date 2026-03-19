import { ForbiddenScopeError } from "../domain/errors.js";
import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

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
          COALESCE(l.repaid_total, 0) AS repaid_total,
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
      `,
      clientCondition.params,
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

  return {
    getPortfolioReport,
    getDisbursementsReport,
  };
}

export {
  createReportQueryService,
};
