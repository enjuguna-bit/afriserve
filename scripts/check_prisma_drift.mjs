import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const target = String(process.argv[2] || "").trim().toLowerCase();

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runNode(scriptPath, args = []) {
  run(process.execPath, [scriptPath, ...args]);
}

function runPrisma(args, env = process.env) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "npx", "prisma", ...args], env);
    return;
  }

  run("npx", ["prisma", ...args], env);
}

function runPrismaCapture(args, env = process.env) {
  const result = spawnSync(
    process.platform === "win32" ? "cmd.exe" : "npx",
    process.platform === "win32"
      ? ["/d", "/s", "/c", "npx", "prisma", ...args]
      : ["prisma", ...args],
    {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "inherit"],
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 && result.status !== 1) {
    process.exit(result.status || 1);
  }

  return {
    status: result.status || 0,
    stdout: String(result.stdout || ""),
  };
}

function resolveShadowDatabaseUrl() {
  if (process.env.SHADOW_DATABASE_URL) {
    return process.env.SHADOW_DATABASE_URL;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL or SHADOW_DATABASE_URL is required for Postgres drift checks.");
  }

  const url = new URL(databaseUrl);
  url.searchParams.set("schema", "shadow");
  return url.toString();
}

function checkSqliteDrift() {
  const databaseUrl = process.env.PRISMA_SQLITE_DIFF_URL || process.env.DATABASE_URL || "file:./data/ci-migrations.db";
  const result = runPrismaCapture([
    "migrate",
    "diff",
    "--from-url",
    databaseUrl,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
  ]);

  const allowedLegacyLines = new Set([
    "[*] Redefined table `domain_events`",
    "[*] Redefined table `loans`",
    "[*] Redefined table `mobile_money_b2c_disbursements`",
    "[*] Redefined table `schema_migrations`",
    "[*] Redefined table `tenants`",
    "[*] Redefined table `user_roles`",
    "[*] Redefined table `users`",
  ]);

  const diffLines = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const unexpectedLines = diffLines.filter((line) => !allowedLegacyLines.has(line));
  if (unexpectedLines.length > 0) {
    process.stderr.write(`Unexpected SQLite drift detected:\n${unexpectedLines.join("\n")}\n`);
    process.exit(1);
  }

  if (diffLines.length > 0) {
    process.stdout.write("SQLite drift matches the current legacy baseline.\n");
  }
}

function checkPostgresDrift() {
  runNode(path.join(repoRoot, "scripts", "prisma-manager.mjs"), ["generate-schema"]);
  runPrisma([
    "migrate",
    "diff",
    "--from-migrations",
    path.join(repoRoot, "prisma", "postgres", "migrations"),
    "--to-schema-datamodel",
    path.join(repoRoot, "prisma", "postgres", "schema.prisma"),
    "--shadow-database-url",
    resolveShadowDatabaseUrl(),
    "--exit-code",
  ]);
}

switch (target) {
  case "sqlite":
    checkSqliteDrift();
    break;
  case "postgres":
    checkPostgresDrift();
    break;
  default:
    throw new Error(`Unsupported prisma drift target: ${target || "<empty>"}`);
}
