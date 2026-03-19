import type { DbRunResult, DbTransactionContext } from "../types/dataLayer.js";

type CoaVersioningServiceOptions = {
  get: (sql: string, params?: unknown[]) => Promise<Record<string, any> | null | undefined>;
  all: (sql: string, params?: unknown[]) => Promise<Array<Record<string, any>>>;
  run: (sql: string, params?: unknown[]) => Promise<DbRunResult>;
  executeTransaction: (callback: (tx: DbTransactionContext) => Promise<unknown> | unknown) => Promise<unknown>;
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

  async function ensureDefaultVersion(): Promise<number> {
    const active = await get(
      `
        SELECT id
        FROM gl_coa_versions
        WHERE LOWER(TRIM(COALESCE(status, ''))) = 'active'
        ORDER BY id ASC
        LIMIT 1
      `,
    );
    const activeId = Number(active?.id || 0);
    if (activeId > 0) {
      return activeId;
    }

    const anyVersion = await get(
      `
        SELECT id
        FROM gl_coa_versions
        ORDER BY id ASC
        LIMIT 1
      `,
    );
    const anyVersionId = Number(anyVersion?.id || 0);
    if (anyVersionId > 0) {
      await run(
        `
          UPDATE gl_coa_versions
          SET status = 'active', activated_at = ?, updated_at = ?
          WHERE id = ?
        `,
        [new Date().toISOString(), new Date().toISOString(), anyVersionId],
      );
      return anyVersionId;
    }

    const nowIso = new Date().toISOString();
    const inserted = await run(
      `
        INSERT INTO gl_coa_versions (
          version_code,
          name,
          status,
          effective_from,
          effective_to,
          parent_version_id,
          notes,
          created_by_user_id,
          activated_by_user_id,
          activated_at,
          created_at,
          updated_at
        )
        VALUES ('COA-DEFAULT', 'Default Chart of Accounts', 'active', ?, NULL, NULL, ?, NULL, NULL, ?, ?, ?)
      `,
      [nowIso.slice(0, 10), "System default CoA baseline", nowIso, nowIso, nowIso],
    );
    const versionId = Number(inserted.lastID || 0);
    if (!versionId) {
      throw new Error("Failed to initialize default CoA version");
    }

    await run(
      `
        INSERT INTO gl_coa_accounts (
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
        )
        SELECT
          ?,
          id,
          code,
          name,
          account_type,
          is_contra,
          1,
          is_active,
          ?,
          ?
        FROM gl_accounts
      `,
      [versionId, nowIso, nowIso],
    );

    return versionId;
  }

  async function listVersions() {
    await ensureDefaultVersion();
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
          GROUP BY coa_version_id
        ) a ON a.coa_version_id = v.id
        ORDER BY
          CASE WHEN LOWER(TRIM(COALESCE(v.status, ''))) = 'active' THEN 0 ELSE 1 END,
          datetime(v.created_at) DESC,
          v.id DESC
      `,
    );
  }

  async function listVersionAccounts(versionId: number) {
    await ensureDefaultVersion();
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
        WHERE coa_version_id = ?
        ORDER BY code ASC
      `,
      [versionId],
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
    await ensureDefaultVersion();
    const versionCode = normalizeVersionCode(payload.versionCode);
    const name = String(payload.name || "").trim();
    if (!versionCode) {
      throw new Error("Version code is required");
    }
    if (!name) {
      throw new Error("Version name is required");
    }

    const existing = await get("SELECT id FROM gl_coa_versions WHERE version_code = ? LIMIT 1", [versionCode]);
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
      const insertedVersion = await tx.run(
        `
          INSERT INTO gl_coa_versions (
            version_code,
            name,
            status,
            effective_from,
            effective_to,
            parent_version_id,
            notes,
            created_by_user_id,
            activated_by_user_id,
            activated_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, 'draft', ?, NULL, ?, ?, ?, NULL, NULL, ?, ?)
        `,
        [versionCode, name, effectiveFrom, parentVersionId, notes, createdByUserId, nowIso, nowIso],
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
            WHERE coa_version_id = ?
            ORDER BY code ASC
          `,
          [cloneFromVersionId],
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

      for (const row of sourceAccounts) {
        await tx.run(
          `
            INSERT INTO gl_coa_accounts (
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
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [
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
          ],
        );
      }

      return versionId;
    });

    const versionId = Number(created || 0);
    const version = await get("SELECT * FROM gl_coa_versions WHERE id = ? LIMIT 1", [versionId]);
    return version;
  }

  async function activateVersion(payload: {
    versionId: number;
    activatedByUserId?: number | null;
    effectiveFrom?: string | Date | null;
  }) {
    await ensureDefaultVersion();
    const versionId = Number(payload.versionId || 0);
    if (!versionId) {
      throw new Error("Valid CoA version id is required");
    }

    const nowIso = new Date().toISOString();
    const effectiveFrom = toIsoDateTime(payload.effectiveFrom, nowIso).slice(0, 10);
    const activatedByUserId = Number(payload.activatedByUserId || 0) || null;

    await executeTransaction(async (tx) => {
      const target = await tx.get("SELECT id FROM gl_coa_versions WHERE id = ? LIMIT 1", [versionId]);
      if (!target) {
        throw new Error("CoA version not found");
      }

      await tx.run(
        `
          UPDATE gl_coa_versions
          SET
            status = 'inactive',
            effective_to = ?,
            updated_at = ?
          WHERE status = 'active' AND id <> ?
        `,
        [effectiveFrom, nowIso, versionId]
      );

      await tx.run(
        `
          UPDATE gl_coa_versions
          SET
            status = 'active',
            activated_by_user_id = ?,
            activated_at = ?,
            effective_from = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [
          activatedByUserId,
          nowIso,
          effectiveFrom,
          nowIso,
          versionId,
        ],
      );
    });

    return get("SELECT * FROM gl_coa_versions WHERE id = ? LIMIT 1", [versionId]);
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
