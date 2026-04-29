import test from "node:test";
import assert from "node:assert/strict";
import { resolveDashboardBranchIdFilter } from "../frontend-next/src/features/dashboard/dashboardScope.ts";

test("admin overall dashboard scope does not fall back to the assigned branch", () => {
  const branchId = resolveDashboardBranchIdFilter({
    normalizedRole: "admin",
    selectedOffice: {
      id: "overall",
      scopeType: "overall",
    },
    userBranchId: 17,
  });

  assert.equal(branchId, undefined);
});

test("operations manager without a loaded office selection keeps the assigned branch scope", () => {
  const branchId = resolveDashboardBranchIdFilter({
    normalizedRole: "operations_manager",
    selectedOffice: null,
    userBranchId: 9,
  });

  assert.equal(branchId, 9);
});

test("branch-scoped dashboard selections use the explicit office branch id", () => {
  const branchId = resolveDashboardBranchIdFilter({
    normalizedRole: "admin",
    selectedOffice: {
      id: 24,
      scopeType: "branch",
    },
    userBranchId: 9,
  });

  assert.equal(branchId, 24);
});
