import { all, dbClient, get, run } from "../db/connection.js";

async function main() {
  if (dbClient !== "postgres") {
    throw new Error("ensureLoansUpdatedAt only supports Postgres deployments.");
  }

  const table = await get("SELECT to_regclass('public.loans') AS table_name");
  if (!table?.table_name) {
    throw new Error("public.loans does not exist.");
  }

  await run("ALTER TABLE loans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ(3)");
  await run("ALTER TABLE loans ADD COLUMN IF NOT EXISTS written_off_at TIMESTAMPTZ(3)");
  await run(
    "UPDATE loans SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL",
  );

  const columns = await all(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'loans'
    ORDER BY ordinal_position
  `);
  const nullCountRow = await get(
    "SELECT COUNT(*)::int AS count FROM loans WHERE updated_at IS NULL",
  );
  const columnNames = columns.map((column) => String(column.column_name || ""));

  console.log(JSON.stringify({
    status: "ok",
    hasUpdatedAt: columnNames.includes("updated_at"),
    hasWrittenOffAt: columnNames.includes("written_off_at"),
    updatedAtNullCount: Number(nullCountRow?.count || 0),
    columns,
  }));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
