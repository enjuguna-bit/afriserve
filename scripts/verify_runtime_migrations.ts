import process from "node:process";
import { closeDb } from "../src/db/connection.js";
import { runMigrations } from "../src/db/schema.js";

async function main() {
  try {
    const result = await runMigrations();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    closeDb();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  process.exit(1);
});
