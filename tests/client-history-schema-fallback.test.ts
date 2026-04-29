import test from "node:test";
import assert from "node:assert/strict";
import { createClientProfileRefreshService } from "../src/services/clientProfileRefreshService.js";

test("listProfileVersions returns empty results when profile refresh schema is unavailable", async () => {
  const service = createClientProfileRefreshService({
    get: async (sql: string) => {
      if (sql.includes("FROM client_profile_refreshes")) {
        throw new Error("SQLITE_ERROR: no such table: client_profile_refreshes");
      }
      return null;
    },
    all: async (sql: string) => {
      if (sql.includes("FROM client_profile_versions")) {
        throw new Error("SQLITE_ERROR: no such table: client_profile_versions");
      }
      if (sql.includes("FROM loans")) {
        return [];
      }
      return [];
    },
    run: async () => ({ lastID: 0, changes: 0 }),
    executeTransaction: async (callback) => callback({
      get: async () => null,
      all: async () => [],
      run: async () => ({ lastID: 0, changes: 0 }),
    }),
    hierarchyService: {
      resolveHierarchyScope: async () => ({ branchIds: [] }),
      isBranchInScope: () => true,
    } as any,
    writeAuditLog: async () => undefined,
    invalidateReportCaches: async () => undefined,
    resolveClientScopeClient: async () => ({
      status: 200 as const,
      client: { id: 9, branch_id: 1 },
    }),
  });

  const result = await service.listProfileVersions(9, { sub: 1, role: "admin", roles: ["admin"] } as any);

  assert.equal(result.status, 200);
  assert.equal(result.body.clientId, 9);
  assert.equal(result.body.currentVersionId, null);
  assert.deepEqual(result.body.versions, []);
  assert.equal(result.body.pendingRefresh, null);
});
