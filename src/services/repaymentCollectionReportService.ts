type DbAll = (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;

interface TargetRepaymentRow {
  repayment_id: number;
  loan_id: number;
  paid_at: string | null;
  total_collected: number;
  applied_amount: number;
  penalty_amount: number;
  overpayment_amount: number;
}

interface ReplayRepaymentRow {
  repayment_id: number;
  loan_id: number;
  paid_at: string | null;
  applied_amount: number;
}

interface InstallmentReplayState {
  installmentId: number;
  installmentNumber: number;
  dueDate: string | null;
  dueDateKey: string | null;
  remainingCents: number;
}

interface RepaymentInstallmentAllocation {
  installmentId: number;
  installmentNumber: number;
  dueDate: string | null;
  dueDateKey: string | null;
  amount: number;
  amountCents: number;
}

export interface RepaymentCollectionEvent {
  repaymentId: number;
  loanId: number;
  paidAt: string | null;
  businessDate: string;
  totalCollected: number;
  totalCollectedCents: number;
  penaltyAmount: number;
  penaltyAmountCents: number;
  unappliedCredit: number;
  unappliedCreditCents: number;
  allocations: RepaymentInstallmentAllocation[];
}

export interface DailyCollectionBreakdownRow {
  date: string;
  repayment_count: number;
  total_collected: number;
  unique_loans: number;
  current_due_collected: number;
  arrears_collected: number;
  advance_collected: number;
  unapplied_credit: number;
}

export interface PeriodCollectionBreakdownSummary {
  repayment_count: number;
  loans_with_repayments: number;
  total_collected: number;
  period_due_collected: number;
  arrears_collected: number;
  advance_collected: number;
  unapplied_credit: number;
}

export interface RepaymentContributionRow {
  repayment_id: number;
  loan_id: number;
  business_date: string;
  total_collected: number;
  current_due_collected: number;
  arrears_collected: number;
  advance_collected: number;
  unapplied_credit: number;
}

const BUSINESS_TIME_ZONE = "Africa/Nairobi";
const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toMoneyCents(value: unknown): number {
  const numericValue = Number(value || 0);
  if (!Number.isFinite(numericValue)) {
    return 0;
  }
  return Math.round(numericValue * 100);
}

function fromMoneyCents(value: number): number {
  return Number((value / 100).toFixed(2));
}

function toBusinessDateKey(value: unknown): string | null {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return null;
  }

  const parsed = new Date(normalizedValue);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const dateParts = businessDateFormatter.formatToParts(parsed);
  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return null;
  }

  return `${year}-${month}-${day}`;
}

function buildIdPlaceholders(ids: number[]): string {
  return ids.map(() => "?").join(", ");
}

function buildAppliedAmountSql(alias: string): string {
  return `
    CASE
      WHEN COALESCE(${alias}.applied_amount, 0) > 0 THEN COALESCE(${alias}.applied_amount, 0)
      WHEN COALESCE(${alias}.principal_amount, 0) > 0 OR COALESCE(${alias}.interest_amount, 0) > 0
        THEN COALESCE(${alias}.principal_amount, 0) + COALESCE(${alias}.interest_amount, 0)
      WHEN (COALESCE(${alias}.amount, 0) - COALESCE(${alias}.penalty_amount, 0) - COALESCE(${alias}.overpayment_amount, 0)) > 0
        THEN COALESCE(${alias}.amount, 0) - COALESCE(${alias}.penalty_amount, 0) - COALESCE(${alias}.overpayment_amount, 0)
      ELSE 0
    END
  `;
}

export async function loadRepaymentCollectionEvents({
  all,
  repaymentWhereSql,
  repaymentWhereParams,
  dateTo,
}: {
  all: DbAll;
  repaymentWhereSql: string;
  repaymentWhereParams: unknown[];
  dateTo?: string | null;
}): Promise<RepaymentCollectionEvent[]> {
  const appliedAmountSql = buildAppliedAmountSql("r");
  const targetRepayments = (await all(
    `
      SELECT
        r.id AS repayment_id,
        r.loan_id,
        r.paid_at,
        COALESCE(r.amount, 0) AS total_collected,
        ${appliedAmountSql} AS applied_amount,
        COALESCE(r.penalty_amount, 0) AS penalty_amount,
        COALESCE(r.overpayment_amount, 0) AS overpayment_amount
      FROM repayments r
      INNER JOIN loans l ON l.id = r.loan_id
      ${repaymentWhereSql}
      ORDER BY r.paid_at ASC, r.id ASC
    `,
    repaymentWhereParams,
  )) as TargetRepaymentRow[];

  if (targetRepayments.length === 0) {
    return [];
  }

  const loanIds = [...new Set(targetRepayments.map((row) => Number(row.loan_id || 0)).filter((value) => value > 0))];
  if (loanIds.length === 0) {
    return [];
  }

  const replayCutoff = String(
    dateTo
      || targetRepayments
        .slice()
        .reverse()
        .find((row) => String(row.paid_at || "").trim())?.paid_at
      || new Date().toISOString(),
  );
  const idPlaceholders = buildIdPlaceholders(loanIds);

  const replayRepayments = (await all(
    `
      SELECT
        r.id AS repayment_id,
        r.loan_id,
        r.paid_at,
        ${appliedAmountSql} AS applied_amount
      FROM repayments r
      WHERE r.loan_id IN (${idPlaceholders})
        AND r.paid_at <= ?
      ORDER BY r.loan_id ASC, r.paid_at ASC, r.id ASC
    `,
    [...loanIds, replayCutoff],
  )) as ReplayRepaymentRow[];

  const installmentRows = await all(
    `
      SELECT
        i.id AS installment_id,
        i.loan_id,
        i.installment_number,
        i.due_date,
        COALESCE(i.amount_due, 0) AS amount_due
      FROM loan_installments i
      WHERE i.loan_id IN (${idPlaceholders})
      ORDER BY i.loan_id ASC, i.installment_number ASC, i.id ASC
    `,
    loanIds,
  );

  const installmentsByLoan = new Map<number, InstallmentReplayState[]>();
  for (const row of installmentRows) {
    const loanId = Number(row.loan_id || 0);
    if (loanId <= 0) {
      continue;
    }
    const existing = installmentsByLoan.get(loanId) || [];
    existing.push({
      installmentId: Number(row.installment_id || 0),
      installmentNumber: Number(row.installment_number || 0),
      dueDate: String(row.due_date || "").trim() || null,
      dueDateKey: toBusinessDateKey(row.due_date),
      remainingCents: Math.max(0, toMoneyCents(row.amount_due)),
    });
    installmentsByLoan.set(loanId, existing);
  }

  const targetRepaymentIds = new Set(targetRepayments.map((row) => Number(row.repayment_id || 0)));
  const targetRepaymentMap = new Map<number, TargetRepaymentRow>();
  for (const row of targetRepayments) {
    targetRepaymentMap.set(Number(row.repayment_id || 0), row);
  }

  const events: RepaymentCollectionEvent[] = [];

  for (const repayment of replayRepayments) {
    const repaymentId = Number(repayment.repayment_id || 0);
    const loanId = Number(repayment.loan_id || 0);
    const installmentStates = installmentsByLoan.get(loanId) || [];
    let remainingAppliedCents = Math.max(0, toMoneyCents(repayment.applied_amount));
    const allocations: RepaymentInstallmentAllocation[] = [];

    for (const installment of installmentStates) {
      if (remainingAppliedCents <= 0) {
        break;
      }
      if (installment.remainingCents <= 0) {
        continue;
      }

      const allocatedCents = Math.min(remainingAppliedCents, installment.remainingCents);
      if (allocatedCents <= 0) {
        continue;
      }

      installment.remainingCents -= allocatedCents;
      remainingAppliedCents -= allocatedCents;
      allocations.push({
        installmentId: installment.installmentId,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        dueDateKey: installment.dueDateKey,
        amount: fromMoneyCents(allocatedCents),
        amountCents: allocatedCents,
      });
    }

    if (!targetRepaymentIds.has(repaymentId)) {
      continue;
    }

    const repaymentMeta = targetRepaymentMap.get(repaymentId);
    const totalCollectedCents = toMoneyCents(repaymentMeta?.total_collected);
    const penaltyAmountCents = Math.max(0, toMoneyCents(repaymentMeta?.penalty_amount));
    const overpaymentAmountCents = Math.max(0, toMoneyCents(repaymentMeta?.overpayment_amount));
    const unappliedCreditCents = Math.max(0, overpaymentAmountCents + remainingAppliedCents);
    const businessDate = toBusinessDateKey(repaymentMeta?.paid_at) || toBusinessDateKey(repayment.paid_at) || "unknown";

    events.push({
      repaymentId,
      loanId,
      paidAt: String(repaymentMeta?.paid_at || repayment.paid_at || "").trim() || null,
      businessDate,
      totalCollected: fromMoneyCents(totalCollectedCents),
      totalCollectedCents,
      penaltyAmount: fromMoneyCents(penaltyAmountCents),
      penaltyAmountCents,
      unappliedCredit: fromMoneyCents(unappliedCreditCents),
      unappliedCreditCents,
      allocations,
    });
  }

  return events.sort((left, right) => {
    if (left.businessDate !== right.businessDate) {
      return left.businessDate.localeCompare(right.businessDate);
    }
    return left.repaymentId - right.repaymentId;
  });
}

export function buildDailyCollectionBreakdownRows(
  events: RepaymentCollectionEvent[],
): DailyCollectionBreakdownRow[] {
  const rowsByDate = new Map<string, {
    repaymentCount: number;
    loanIds: Set<number>;
    totalCollectedCents: number;
    currentDueCollectedCents: number;
    arrearsCollectedCents: number;
    advanceCollectedCents: number;
    unappliedCreditCents: number;
  }>();

  for (const event of events) {
    const rowDate = event.businessDate;
    const row = rowsByDate.get(rowDate) || {
      repaymentCount: 0,
      loanIds: new Set<number>(),
      totalCollectedCents: 0,
      currentDueCollectedCents: 0,
      arrearsCollectedCents: 0,
      advanceCollectedCents: 0,
      unappliedCreditCents: 0,
    };

    row.repaymentCount += 1;
    row.loanIds.add(event.loanId);
    row.totalCollectedCents += event.totalCollectedCents;
    row.arrearsCollectedCents += event.penaltyAmountCents;
    row.unappliedCreditCents += event.unappliedCreditCents;

    for (const allocation of event.allocations) {
      if (!allocation.dueDateKey || allocation.dueDateKey === rowDate) {
        row.currentDueCollectedCents += allocation.amountCents;
        continue;
      }
      if (allocation.dueDateKey < rowDate) {
        row.arrearsCollectedCents += allocation.amountCents;
        continue;
      }
      row.advanceCollectedCents += allocation.amountCents;
    }

    rowsByDate.set(rowDate, row);
  }

  return [...rowsByDate.entries()]
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, row]) => ({
      date,
      repayment_count: row.repaymentCount,
      total_collected: fromMoneyCents(row.totalCollectedCents),
      unique_loans: row.loanIds.size,
      current_due_collected: fromMoneyCents(row.currentDueCollectedCents),
      arrears_collected: fromMoneyCents(row.arrearsCollectedCents),
      advance_collected: fromMoneyCents(row.advanceCollectedCents),
      unapplied_credit: fromMoneyCents(row.unappliedCreditCents),
    }));
}

export function buildPeriodCollectionBreakdownSummary({
  events,
  dateFrom,
  dateTo,
}: {
  events: RepaymentCollectionEvent[];
  dateFrom?: string | null;
  dateTo?: string | null;
}): PeriodCollectionBreakdownSummary {
  const periodStartKey = toBusinessDateKey(dateFrom);
  const periodEndKey = toBusinessDateKey(dateTo);
  const uniqueLoans = new Set<number>();

  let totalCollectedCents = 0;
  let periodDueCollectedCents = 0;
  let arrearsCollectedCents = 0;
  let advanceCollectedCents = 0;
  let unappliedCreditCents = 0;

  for (const event of events) {
    uniqueLoans.add(event.loanId);
    totalCollectedCents += event.totalCollectedCents;
    arrearsCollectedCents += event.penaltyAmountCents;
    unappliedCreditCents += event.unappliedCreditCents;

    for (const allocation of event.allocations) {
      const dueDateKey = allocation.dueDateKey;
      if (periodStartKey && dueDateKey && dueDateKey < periodStartKey) {
        arrearsCollectedCents += allocation.amountCents;
        continue;
      }
      if (periodEndKey && dueDateKey && dueDateKey > periodEndKey) {
        advanceCollectedCents += allocation.amountCents;
        continue;
      }
      periodDueCollectedCents += allocation.amountCents;
    }
  }

  return {
    repayment_count: events.length,
    loans_with_repayments: uniqueLoans.size,
    total_collected: fromMoneyCents(totalCollectedCents),
    period_due_collected: fromMoneyCents(periodDueCollectedCents),
    arrears_collected: fromMoneyCents(arrearsCollectedCents),
    advance_collected: fromMoneyCents(advanceCollectedCents),
    unapplied_credit: fromMoneyCents(unappliedCreditCents),
  };
}

export function buildRepaymentContributionRows(
  events: RepaymentCollectionEvent[],
): RepaymentContributionRow[] {
  return events.map((event) => {
    let currentDueCollectedCents = 0;
    let arrearsCollectedCents = event.penaltyAmountCents;
    let advanceCollectedCents = 0;

    for (const allocation of event.allocations) {
      if (!allocation.dueDateKey || allocation.dueDateKey === event.businessDate) {
        currentDueCollectedCents += allocation.amountCents;
        continue;
      }
      if (allocation.dueDateKey < event.businessDate) {
        arrearsCollectedCents += allocation.amountCents;
        continue;
      }
      advanceCollectedCents += allocation.amountCents;
    }

    return {
      repayment_id: event.repaymentId,
      loan_id: event.loanId,
      business_date: event.businessDate,
      total_collected: event.totalCollected,
      current_due_collected: fromMoneyCents(currentDueCollectedCents),
      arrears_collected: fromMoneyCents(arrearsCollectedCents),
      advance_collected: fromMoneyCents(advanceCollectedCents),
      unapplied_credit: event.unappliedCredit,
    };
  });
}

