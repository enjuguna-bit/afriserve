import test from "node:test";
import assert from "node:assert/strict";
import { createReportCacheService } from "../src/services/reportCacheService.js";
test("report cache returns hit before ttl expiry and misses after expiry", async () => {
  let nowMs = 1_000;
  const cache = createReportCacheService({
    enabled: true,
    strategy: "memory",
    defaultTtlMs: 500,
    now: () => nowMs,
  });

  let computeCalls = 0;
  const key = cache.buildKey("reports:portfolio", { scope: { branchIds: [2, 1] }, includeBreakdown: false });

  const first = await cache.getOrSet({
    key,
    compute: () => {
      computeCalls += 1;
      return { total_loans: 10 };
    },
  });
  assert.equal(first.cacheHit, false);
  assert.equal(computeCalls, 1);

  const second = await cache.getOrSet({
    key,
    compute: () => {
      computeCalls += 1;
      return { total_loans: 99 };
    },
  });
  assert.equal(second.cacheHit, true);
  assert.equal(second.value.total_loans, 10);
  assert.equal(computeCalls, 1);

  nowMs += 600;
  const third = await cache.getOrSet({
    key,
    compute: () => {
      computeCalls += 1;
      return { total_loans: 20 };
    },
  });
  assert.equal(third.cacheHit, false);
  assert.equal(third.value.total_loans, 20);
  assert.equal(computeCalls, 2);
});

test("report cache disabled mode always computes fresh values", async () => {
  const cache = createReportCacheService({
    enabled: false,
  });

  let computeCalls = 0;
  const key = cache.buildKey("reports:collections-summary", { scope: { level: "hq" } });

  await cache.getOrSet({
    key,
    compute: () => {
      computeCalls += 1;
      return { overdue_loans: 1 };
    },
  });

  await cache.getOrSet({
    key,
    compute: () => {
      computeCalls += 1;
      return { overdue_loans: 2 };
    },
  });

  assert.equal(computeCalls, 2);
});

test("report cache key builder is stable for object key ordering", () => {
  const cache = createReportCacheService({ enabled: true });
  const keyA = cache.buildKey("reports:test", {
    userId: 1,
    scope: {
      level: "region",
      branchIds: [1, 2, 3],
    },
  });
  const keyB = cache.buildKey("reports:test", {
    scope: {
      branchIds: [1, 2, 3],
      level: "region",
    },
    userId: 1,
  });

  assert.equal(keyA, keyB);
});

