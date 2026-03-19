import test from "node:test";
import assert from "node:assert/strict";
import { createSqlWhereBuilder } from "../src/utils/sqlBuilder.js";
test("sql builder composes where fragments and preserves parameter order", () => {
  const builder = createSqlWhereBuilder();
  builder.addClause("l.status IN ('active', 'restructured')");
  builder.addDateRange("l.disbursed_at", "2026-01-01T00:00:00.000Z", "2026-01-31T23:59:59.000Z");
  builder.addEquals("l.branch_id", 12);

  assert.equal(
    builder.buildWhere(),
    "WHERE l.status IN ('active', 'restructured') AND datetime(l.disbursed_at) >= datetime(?) AND datetime(l.disbursed_at) <= datetime(?) AND l.branch_id = ?",
  );
  assert.deepEqual(builder.getParams(), [
    "2026-01-01T00:00:00.000Z",
    "2026-01-31T23:59:59.000Z",
    12,
  ]);
});

test("sql builder supports AND fragment emission for nested conditions", () => {
  const builder = createSqlWhereBuilder();
  builder.addClause("i.status != 'paid'");

  assert.equal(builder.buildAnd(), "AND i.status != 'paid'");
  assert.equal(builder.hasClauses(), true);
});

test("sql builder rejects unsafe column references", () => {
  const builder = createSqlWhereBuilder();

  assert.throws(
    () => builder.addDateRange("l.disbursed_at); DROP TABLE loans;--", "2026-01-01T00:00:00.000Z", null),
    /Unsafe SQL column reference/,
  );
});
