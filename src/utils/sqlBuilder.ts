const SAFE_SQL_COLUMN_REF = /^[A-Za-z_][A-Za-z0-9_.]*$/;

interface SqlCondition {
  sql: string;
  params?: unknown[];
}

function assertSafeColumnRef(columnRef: string): string {
  if (!SAFE_SQL_COLUMN_REF.test(columnRef)) {
    throw new Error(`Unsafe SQL column reference: ${columnRef}`);
  }
  return columnRef;
}

function createSqlWhereBuilder() {
  const clauses: string[] = [];
  const params: unknown[] = [];

  function addClause(sql: string | null | undefined, clauseParams: unknown[] = []): void {
    if (!sql || !String(sql).trim()) {
      return;
    }
    clauses.push(String(sql).trim());
    params.push(...clauseParams);
  }

  function addCondition(condition: SqlCondition | null | undefined): void {
    if (!condition) {
      return;
    }
    addClause(condition.sql, Array.isArray(condition.params) ? condition.params : []);
  }

  function addEquals(columnRef: string, value: unknown): void {
    const safeColumnRef = assertSafeColumnRef(columnRef);
    addClause(`${safeColumnRef} = ?`, [value]);
  }

  function addDateRange(
    columnRef: string,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
  ): void {
    const safeColumnRef = assertSafeColumnRef(columnRef);
    if (dateFrom) {
      addClause(`datetime(${safeColumnRef}) >= datetime(?)`, [dateFrom]);
    }
    if (dateTo) {
      addClause(`datetime(${safeColumnRef}) <= datetime(?)`, [dateTo]);
    }
  }

  function buildWhere(): string {
    return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  }

  function buildAnd(): string {
    return clauses.length > 0 ? `AND ${clauses.join(" AND ")}` : "";
  }

  function getParams(): unknown[] {
    return [...params];
  }

  function addNotNull(columnRef: string): void {
    const safeColumnRef = assertSafeColumnRef(columnRef);
    addClause(`${safeColumnRef} IS NOT NULL`);
  }

  function addIsNull(columnRef: string): void {
    const safeColumnRef = assertSafeColumnRef(columnRef);
    addClause(`${safeColumnRef} IS NULL`);
  }

  function getClauses(): string[] {
    return [...clauses];
  }

    function hasClauses(): boolean {
    return clauses.length > 0;
  }

  return {
    addClause,
    addCondition,
    addEquals,
    addDateRange,
    buildWhere,
    buildAnd,
    getParams,
    getClauses,
    hasClauses,
    addNotNull,
    addIsNull,
  };
}

export {
  createSqlWhereBuilder,
};
