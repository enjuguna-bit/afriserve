import { createSqlWhereBuilder } from "../utils/sqlBuilder.js";

type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
type DbGet = (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;

interface MobileMoneyReadRepositoryDeps {
  all: DbAll;
  get: DbGet;
}

interface B2CFilterArgs {
  status?: string;
  loanId?: number;
  providerRequestId?: string;
}

interface ListB2CDisbursementsArgs extends B2CFilterArgs {
  limit: number;
}

interface ListC2BEventsArgs {
  status?: string;
  limit: number;
}

function createMobileMoneyReadRepository(deps: MobileMoneyReadRepositoryDeps) {
  const { all, get } = deps;

  function buildB2CWhere(filters: B2CFilterArgs, includeProviderRequestId: boolean) {
    const where = createSqlWhereBuilder();
    const status = String(filters.status || "").trim().toLowerCase();
    const loanId = Number(filters.loanId || 0);
    const providerRequestId = String(filters.providerRequestId || "").trim();

    if (status) {
      where.addEquals("status", status);
    }

    if (Number.isInteger(loanId) && loanId > 0) {
      where.addEquals("loan_id", loanId);
    }

    if (includeProviderRequestId && providerRequestId) {
      where.addClause("(provider_request_id = ? OR request_id = ?)", [providerRequestId, providerRequestId]);
    }

    return {
      whereSql: where.buildWhere(),
      params: where.getParams(),
    };
  }

  async function listB2CDisbursements(args: ListB2CDisbursementsArgs) {
    const { whereSql, params } = buildB2CWhere(args, true);
    return all(
      `
        SELECT
          id,
          request_id,
          loan_id,
          provider,
          amount,
          phone_number,
          account_reference,
          narration,
          initiated_by_user_id,
          provider_request_id,
          status,
          failure_reason,
          COALESCE(reversal_attempts, 0) AS reversal_attempts,
          reversal_last_requested_at,
          created_at,
          updated_at
        FROM mobile_money_b2c_disbursements
        ${whereSql}
        ORDER BY id DESC
        LIMIT ?
      `,
      [...params, args.limit],
    );
  }

  async function listC2BEvents(args: ListC2BEventsArgs) {
    const where = createSqlWhereBuilder();
    const status = String(args.status || "").trim().toLowerCase();
    if (status) {
      if (status === "unmatched") {
        where.addEquals("status", "rejected");
        where.addClause("loan_id IS NULL");
        where.addClause("repayment_id IS NULL");
      } else {
        where.addEquals("status", status);
      }
    }

    return all(
      `
        SELECT
          id,
          provider,
          external_receipt,
          account_reference,
          payer_phone,
          amount,
          paid_at,
          status,
          loan_id,
          repayment_id,
          reconciliation_note,
          reconciled_at,
          created_at
        FROM mobile_money_c2b_events
        ${where.buildWhere()}
        ORDER BY id DESC
        LIMIT ?
      `,
      [...where.getParams(), args.limit],
    );
  }

  async function getB2CDisbursementSummary(args: B2CFilterArgs) {
    const { whereSql, params } = buildB2CWhere(args, false);
    return get(
      `
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
          SUM(CASE WHEN status = 'core_failed' THEN 1 ELSE 0 END) AS core_failed_count,
          SUM(CASE WHEN status IN ('failed', 'core_failed') THEN 1 ELSE 0 END) AS reversal_required_count,
          ROUND(COALESCE(SUM(COALESCE(reversal_attempts, 0)), 0), 0) AS total_reversal_attempts
        FROM mobile_money_b2c_disbursements
        ${whereSql}
      `,
      params,
    );
  }

  return {
    listC2BEvents,
    listB2CDisbursements,
    getB2CDisbursementSummary,
  };
}

export {
  createMobileMoneyReadRepository,
};