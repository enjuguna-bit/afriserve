#!/usr/bin/env node
import "dotenv/config";
import { initSchema, runMigrations, closeDb } from "../src/db.js";
function parseStepsArgument(args) {
  const matchingArg = args.find((arg) => arg.startsWith("--steps="));
  if (!matchingArg) {
    return null;
  }

  const value = Number(matchingArg.slice("--steps=".length));
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function main() {
  const args = process.argv.slice(2);
  const directionArg = String(args[0] || "up").trim().toLowerCase();
  if (!["up", "down"].includes(directionArg)) {
    throw new Error("Usage: node scripts/migrate.js [up|down] [--steps=1]");
  }

  const steps = parseStepsArgument(args);
  await initSchema();
  const result = await runMigrations({
    direction: directionArg === "down" ? "down" : "up",
    steps,
  });

  console.log(`[migrations] direction=${result.direction} applied=${result.applied.length} skipped=${result.skipped.length}`);
  if (result.applied.length > 0) {
    console.log(`[migrations] changed=${result.applied.join(", ")}`);
  }
}

main()
  .catch((error) => {
    console.error(`[migrations] failed: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => {
    return Promise.resolve(closeDb());
  });
