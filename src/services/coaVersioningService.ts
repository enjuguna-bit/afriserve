import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";
import { getConfiguredDbClient } from "../utils/env.js";
import { getCurrentTenantId } from "../utils/tenantStore.js";

type CoaVersioningServiceOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: DbTransactionContext) => Promise<unknown> | unknown) => Promise<unknown>;
};

type CoaSchemaState = {
  versionHasTenantId: boolean;
  accountHasTenantId: boolean;
};

function toIsoDateTime(value: unknown, fallback = new Date().toISOString()): string {
  if (!value) return fallback;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function normalizeVersionCode(value: unknown): string {
  return String(value || "").trim().toUpperCase();
}

function createCoaVersioningService(options: CoaVersioningServiceOptions) {
  const {
    get,
    all,
    run,
    executeTransaction,
  } = options;
  const dbClient = getConfiguredDbClient();
  const createdAtOrderExpression = dbClient === "postgres"
    ? "v.created_at DESC NULLS LAST"
    : "datetime(v.created_at) DESC";
  const tableColumnCache = new Map<string, Set<string> | null>();
  let schemaStatePromise: Promise<CoaSchemaState> | null = null;

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

  async function getSchemaState(): Promise<CoaSchemaState> {
    if (!schemaStatePromise) {
      schemaStatePromise = Promise.all([
        columnExists("gl_coa_versions", "tenant_id"),
        columnExists("gl_coa_accounts", "tenant_id"),
      ]).then(([versionHasTenantId, accountHasTenantId]) => ({
        versionHasTenantId,
        accountHasTenantId,
      }));
    }

    return schemaStatePromise;
  }

  function appendTenantClause(clauses: string[], params: unknown[], columnRef: string, enabled: boolean, tenantId: string) {
    if (enabled) {
      clauses.push(`${columnRef} = ?`);
      params.push(tenantId);
    }
  }

  async function ensureDefaultVersion(): Promise<number> {
    const tenantId = getCurrentTenantId();
    const schemaState = await getSchemaState();
    const activeClauses = ["LOWER(TRIM(COALESCE(status, ''))) = 'active'"];
    const activeParams: unknown[] = [];
    appendTenantClause(activeClauses, activeParams, "tenant_id", schemaState.versionHasTenantId, tenantId);

    const active = await get(
      `
        SELECT id
        FROM gl_coa_versions
        WHERE ${activeClauses.join(" AND ")}
        ORDER BY id ASC
        LIMIT 1
      `,
      activeParams,
    );
    const activeId = Number(active?.id || 0);
    if (activeId > 0) {
      return activeId;
    }

    const anyVersionClauses: string[] = [];
    const anyVersionParams: unknown[] = [];
    appendTenantClause(anyVersionClauses, anyVersionParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
    const anyVersionWhereSql = anyVersionClauses.length > 0 ? `WHERE ${anyVersionClauses.join(" AND ")}` : "";
    const anyVersion = await get(
      `
        SELECT id
        FROM gl_coa_versions
        ${anyVersionWhereSql}
        ORDER BY id ASC
        LIMIT 1
      `,
      anyVersionParams,
    );
    const anyVersionId = Number(anyVersion?.id || 0);
    if (anyVersionId > 0) {
      const nowIso = new Date().toISOString();
      const updateClauses = ["id = ?"];
      const updateParams: unknown[] = [nowIso, nowIso, anyVersionId];
      appendTenantClause(updateClauses, updateParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
      await run(
        `
          UPDATE gl_coa_versions
          SET status = 'active', activated_at = ?, updated_at = ?
          WHERE ${updateClauses.join(" AND ")}
        `,
        updateParams,
      );
      return anyVersionId;
    }

    const nowIso = new Date().toISOString();
    const versionColumns = [
      ...(schemaState.versionHasTenantId ? ["tenant_id"] : []),
      "version_code",
      "name",
      "status",
      "effective_from",
      "effective_to",
      "parent_version_id",
      "notes",
      "created_by_user_id",
      "activated_by_user_id",
      "activated_at",
      "created_at",
      "updated_at",
    ];
    const versionValues = [
      ...(schemaState.versionHasTenantId ? [tenantId] : []),
      "COA-DEFAULT",
      "Default Chart of Accounts",
      "active",
      nowIso.slice(0, 10),
      null,
      null,
      "System default CoA baseline",
      null,
      null,
      nowIso,
      nowIso,
      nowIso,
    ];
    const inserted = await run(
      `
        INSERT INTO gl_coa_versions (${versionColumns.join(", ")})
        VALUES (${versionColumns.map(() => "?").join(", ")})
      `,
      versionValues,
    );
    const versionId = Number(inserted.lastID || 0);
    if (!versionId) {
      throw new Error("Failed to initialize default CoA version");
    }

    const accountColumns = [
      ...(schemaState.accountHasTenantId ? ["tenant_id"] : []),
      "coa_version_id",
      "base_account_id",
      "code",
      "name",
      "account_type",
      "is_contra",
      "is_posting_allowed",
      "is_active",
      "created_at",
      "updated_at",
    ];
    const accountSelectValues = [
      ...(schemaState.accountHasTenantId ? ["?"] : []),
      "?",
      "id",
      "code",
      "name",
      "account_type",
      "is_contra",
      "1",
      "is_active",
      "?",
      "?",
    ];
    await run(
      `
        INSERT INTO gl_coa_accounts (${accountColumns.join(", ")})
        SELECT ${accountSelectValues.join(", ")}
        FROM gl_accounts
      `,
      [
        ...(schemaState.accountHasTenantId ? [tenantId] : []),
        versionId,
        nowIso,
        nowIso,
      ],
    );

    return versionId;
  }

  async function listVersions() {
    const tenantId = getCurrentTenantId();
    const schemaState = await getSchemaState();
    await ensureDefaultVersion();
    const params: unknown[] = [];
    const accountCountWhereSql = schemaState.accountHasTenantId ? "WHERE tenant_id = ?" : "";
    if (schemaState.accountHasTenantId) {
      params.push(tenantId);
    }
    const versionWhereClauses: string[] = [];
    appendTenantClause(versionWhereClauses, params, "v.tenant_id", schemaState.versionHasTenantId, tenantId);
    const versionWhereSql = versionWhereClauses.length > 0 ? `WHERE ${versionWhereClauses.join(" AND ")}` : "";

    return all(
      `
        SELECT
          v.id,
          v.version_code,
          v.name,
          v.status,
          v.effective_from,
          v.effective_to,
          v.parent_version_id,
          v.notes,
          v.created_by_user_id,
          v.activated_by_user_id,
          v.activated_at,
          v.created_at,
          v.updated_at,
          COALESCE(a.account_count, 0) AS account_count
        FROM gl_coa_versions v
        LEFT JOIN (
          SELECT
            coa_version_id,
            COUNT(1) AS account_count
          FROM gl_coa_accounts
          ${accountCountWhereSql}
          GROUP BY coa_version_id
        ) a ON a.coa_version_id = v.id
        ${versionWhereSql}
        ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(v.status, ''))) = 'active' THEN 0 ELSE 1 END,
          ${createdAtOrderExpression},
          v.id DESC
      `,
      params,
    );
  }

  async function listVersionAccounts(versionId: number) {
    const tenantId = getCurrentTenantId();
    const schemaState = await getSchemaState();
    await ensureDefaultVersion();
    const whereClauses = ["coa_version_id = ?"];
    const params: unknown[] = [versionId];
    appendTenantClause(whereClauses, params, "tenant_id", schemaState.accountHasTenantId, tenantId);

    return all(
      `
        SELECT
          id,
          coa_version_id,
          base_account_id,
          code,
          name,
          account_type,
          is_contra,
          is_posting_allowed,
          is_active,
          created_at,
          updated_at
        FROM gl_coa_accounts
        WHERE ${whereClauses.join(" AND ")}
        ORDER BY code ASC
      `,
      params,
    );
  }

  async function createVersion(payload: {
    versionCode: string;
    name: string;
    notes?: string | null;
    parentVersionId?: number | null;
    cloneFromVersionId?: number | null;
    createdByUserId?: number | null;
    effectiveFrom?: string | Date | null;
  }) {
    const tenantId = getCurrentTenantId();
    const schemaState = await getSchemaState();
    await ensureDefaultVersion();
    const versionCode = normalizeVersionCode(payload.versionCode);
    const name = String(payload.name || "").trim();
    if (!versionCode) {
      throw new Error("Version code is required");
    }
    if (!name) {
      throw new Error("Version name is required");
    }

    const existingClauses = ["version_code = ?"];
    const existingParams: unknown[] = [versionCode];
    appendTenantClause(existingClauses, existingParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
    const existing = await get(
      `
        SELECT id
        FROM gl_coa_versions
        WHERE ${existingClauses.join(" AND ")}
        LIMIT 1
      `,
      existingParams,
    );
    if (existing) {
      throw new Error(`CoA version already exists: ${versionCode}`);
    }

    const nowIso = new Date().toISOString();
    const effectiveFrom = toIsoDateTime(payload.effectiveFrom, nowIso).slice(0, 10);
    const parentVersionId = Number(payload.parentVersionId || 0) || null;
    const cloneFromVersionId = Number(payload.cloneFromVersionId || parentVersionId || 0) || null;
    const createdByUserId = Number(payload.createdByUserId || 0) || null;
    const notes = String(payload.notes || "").trim() || null;

    const created = await executeTransaction(async (tx) => {
      const versionColumns = [
        ...(schemaState.versionHasTenantId ? ["tenant_id"] : []),
        "version_code",
        "name",
        "status",
        "effective_from",
        "effective_to",
        "parent_version_id",
        "notes",
        "created_by_user_id",
        "activated_by_user_id",
        "activated_at",
        "created_at",
        "updated_at",
      ];
      const versionValues = [
        ...(schemaState.versionHasTenantId ? [tenantId] : []),
        versionCode,
        name,
        "draft",
        effectiveFrom,
        null,
        parentVersionId,
        notes,
        createdByUserId,
        null,
        null,
        nowIso,
        nowIso,
      ];
      const insertedVersion = await tx.run(
        `
          INSERT INTO gl_coa_versions (${versionColumns.join(", ")})
          VALUES (${versionColumns.map(() => "?").join(", ")})
        `,
        versionValues,
      );
      const versionId = Number(insertedVersion.lastID || 0);
      if (!versionId) {
        throw new Error("Failed to create CoA version");
      }

      const sourceAccounts = cloneFromVersionId
        ? await tx.all(
          `
            SELECT
              base_account_id,
              code,
              name,
              account_type,
              is_contra,
              is_posting_allowed,
              is_active
            FROM gl_coa_accounts
            WHERE ${[
              ...(schemaState.accountHasTenantId ? ["tenant_id = ?"] : []),
              "coa_version_id = ?",
            ].join(" AND ")}
            ORDER BY code ASC
          `,
          [
            ...(schemaState.accountHasTenantId ? [tenantId] : []),
            cloneFromVersionId,
          ],
        )
        : await tx.all(
          `
            SELECT
              id AS base_account_id,
              code,
              name,
              account_type,
              is_contra,
              1 AS is_posting_allowed,
              is_active
            FROM gl_accounts
            ORDER BY code ASC
          `,
        );

      const accountColumns = [
        ...(schemaState.accountHasTenantId ? ["tenant_id"] : []),
        "coa_version_id",
        "base_account_id",
        "code",
        "name",
        "account_type",
        "is_contra",
        "is_posting_allowed",
        "is_active",
        "created_at",
        "updated_at",
      ];

      for (const row of sourceAccounts) {
        const accountValues = [
          ...(schemaState.accountHasTenantId ? [tenantId] : []),
          versionId,
          Number(row.base_account_id || 0) || null,
          String(row.code || "").trim().toUpperCase(),
          String(row.name || "").trim(),
          String(row.account_type || "").trim().toLowerCase(),
          Number(row.is_contra || 0),
          Number(row.is_posting_allowed || 0) === 1 ? 1 : 0,
          Number(row.is_active || 0) === 1 ? 1 : 0,
          nowIso,
          nowIso,
        ];
        await tx.run(
          `
            INSERT INTO gl_coa_accounts (${accountColumns.join(", ")})
            VALUES (${accountColumns.map(() => "?").join(", ")})
          `,
          accountValues,
        );
      }

      return versionId;
    });

    const versionId = Number(created || 0);
    const versionWhereClauses = ["id = ?"];
    const versionWhereParams: unknown[] = [versionId];
    appendTenantClause(versionWhereClauses, versionWhereParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
    return get(
      `
        SELECT *
        FROM gl_coa_versions
        WHERE ${versionWhereClauses.join(" AND ")}
        LIMIT 1
      `,
      versionWhereParams,
    );
  }

  async function activateVersion(payload: {
    versionId: number;
    activatedByUserId?: number | null;
    effectiveFrom?: string | Date | null;
  }) {
    const tenantId = getCurrentTenantId();
    const schemaState = await getSchemaState();
    await ensureDefaultVersion();
    const versionId = Number(payload.versionId || 0);
    if (!versionId) {
      throw new Error("Valid CoA version id is required");
    }

    const nowIso = new Date().toISOString();
    const effectiveFrom = toIsoDateTime(payload.effectiveFrom, nowIso).slice(0, 10);
    const activatedByUserId = Number(payload.activatedByUserId || 0) || null;

    await executeTransaction(async (tx) => {
      const targetClauses = ["id = ?"];
      const targetParams: unknown[] = [versionId];
      appendTenantClause(targetClauses, targetParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
      const target = await tx.get(
        `
          SELECT id
          FROM gl_coa_versions
          WHERE ${targetClauses.join(" AND ")}
          LIMIT 1
        `,
        targetParams,
      );
      if (!target) {
        throw new Error("CoA version not found");
      }

      const deactivateClauses = ["status = 'active'", "id <> ?"];
      const deactivateParams: unknown[] = [effectiveFrom, nowIso, versionId];
      appendTenantClause(deactivateClauses, deactivateParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
      await tx.run(
        `
          UPDATE gl_coa_versions
          SET
            status = 'inactive',
            effective_to = ?,
            updated_at = ?
          WHERE ${deactivateClauses.join(" AND ")}
        `,
        deactivateParams,
      );

      const activateClauses = ["id = ?"];
      const activateParams: unknown[] = [
        activatedByUserId,
        nowIso,
        effectiveFrom,
        nowIso,
        versionId,
      ];
      appendTenantClause(activateClauses, activateParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
      await tx.run(
        `
          UPDATE gl_coa_versions
          SET
            status = 'active',
            activated_by_user_id = ?,
            activated_at = ?,
            effective_from = ?,
            updated_at = ?
          WHERE ${activateClauses.join(" AND ")}
        `,
        activateParams,
      );
    });

    const versionWhereClauses = ["id = ?"];
    const versionWhereParams: unknown[] = [versionId];
    appendTenantClause(versionWhereClauses, versionWhereParams, "tenant_id", schemaState.versionHasTenantId, tenantId);
    return get(
      `
        SELECT *
        FROM gl_coa_versions
        WHERE ${versionWhereClauses.join(" AND ")}
        LIMIT 1
      `,
      versionWhereParams,
    );
  }

  return {
    ensureDefaultVersion,
    listVersions,
    listVersionAccounts,
    createVersion,
    activateVersion,
  };
}

export {
  createCoaVersioningService,
};
