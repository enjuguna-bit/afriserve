import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.basename(path.dirname(currentDir)) === "dist"
  ? path.resolve(currentDir, "..", "..")
  : path.resolve(currentDir, "..");

function extractPinnedPrismaVersion(dockerfile: string): string | null {
  const match = dockerfile.match(/npm install --no-save --ignore-scripts prisma@(\d+\.\d+\.\d+)/);
  return match?.[1] || null;
}

function dockerfileInstallsOpenSsl(dockerfile: string): boolean {
  return /apt-get install -y --no-install-recommends openssl/.test(dockerfile);
}

function extractDockerNodeMajorVersion(dockerfile: string): string | null {
  const match = dockerfile.match(/FROM node:(\d+)-bookworm-slim AS builder/);
  return match?.[1] || null;
}

function extractCiNodeMajorVersion(ciWorkflow: string): string | null {
  const match = ciWorkflow.match(/node-version:\s*(\d+)/);
  return match?.[1] || null;
}

function ciWorkflowUsesPostgresService(ciWorkflow: string): boolean {
  return /services:\s+postgres:/m.test(ciWorkflow)
    && /image:\s+postgres:/m.test(ciWorkflow)
    && /DB_CLIENT:\s+postgres/m.test(ciWorkflow)
    && /DATABASE_URL:\s+postgresql:\/\//m.test(ciWorkflow);
}

function schemaIncludesOpenSsl3BinaryTarget(schema: string): boolean {
  return /binaryTargets\s*=\s*\[[^\]]*"debian-openssl-3\.0\.x"[^\]]*\]/.test(schema);
}

function extractLockedPrismaVersion(packageLock: Record<string, any>): string | null {
  return String(packageLock.packages?.["node_modules/prisma"]?.version || "").trim() || null;
}

test("Docker runtime Prisma CLI version matches the lockfile-resolved dependency", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
  const packageLock = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package-lock.json"), "utf8"),
  ) as Record<string, any>;

  const dockerPrismaVersion = extractPinnedPrismaVersion(dockerfile);
  const lockedPrismaVersion = extractLockedPrismaVersion(packageLock);

  assert.ok(dockerPrismaVersion, "Dockerfile should install a pinned Prisma CLI version");
  assert.ok(lockedPrismaVersion, "package-lock.json should resolve a Prisma CLI version");
  assert.equal(dockerPrismaVersion, lockedPrismaVersion);
});

test("Docker runtime installs OpenSSL for Prisma startup", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");

  assert.equal(
    dockerfileInstallsOpenSsl(dockerfile),
    true,
    "Dockerfile should install openssl in the runtime image for Prisma startup",
  );
});

test("Prisma schema includes the OpenSSL 3 runtime binary target", () => {
  const schema = fs.readFileSync(path.join(repoRoot, "prisma", "schema.prisma"), "utf8");

  assert.equal(
    schemaIncludesOpenSsl3BinaryTarget(schema),
    true,
    "prisma/schema.prisma should include debian-openssl-3.0.x in generator binaryTargets",
  );
});

test("CI Node version is aligned with the Docker builder image", () => {
  const dockerfile = fs.readFileSync(path.join(repoRoot, "Dockerfile"), "utf8");
  const ciWorkflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");

  const dockerNodeMajorVersion = extractDockerNodeMajorVersion(dockerfile);
  const ciNodeMajorVersion = extractCiNodeMajorVersion(ciWorkflow);

  assert.equal(dockerNodeMajorVersion, "22");
  assert.ok(ciNodeMajorVersion, "CI workflow should declare a Node version");
  assert.equal(ciNodeMajorVersion, dockerNodeMajorVersion);
});

test("CI runs coverage-gated tests against a real Postgres service", () => {
  const ciWorkflow = fs.readFileSync(path.join(repoRoot, ".github", "workflows", "ci.yml"), "utf8");
  const packageJson = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
  ) as Record<string, any>;

  assert.equal(
    ciWorkflowUsesPostgresService(ciWorkflow),
    true,
    "CI should provision Postgres and run tests with DB_CLIENT=postgres",
  );
  assert.match(
    String(packageJson.scripts?.["test:coverage:ci"] || ""),
    /--check-coverage --lines 70/,
    "CI coverage script should enforce the minimum line coverage threshold",
  );
  assert.match(
    ciWorkflow,
    /run:\s+npm run test:coverage:ci/,
    "CI workflow should use the coverage-gated script",
  );
});

test("Postgres connection pool is eagerly initialised at startup, not lazily on first query", () => {
  const lifecycleSource = fs.readFileSync(
    path.join(repoRoot, "src", "runtime", "lifecycle.ts"),
    "utf8",
  );

  assert.match(
    lifecycleSource,
    /getConfiguredDbClient\(\) === ["']postgres["']/,
    "lifecycle.ts should branch on DB_CLIENT=postgres",
  );
  assert.match(
    lifecycleSource,
    /await initializePool\(\)/,
    "lifecycle.ts should eagerly await initializePool() at startup so connection errors surface immediately",
  );

  const postgresConnectionSource = fs.readFileSync(
    path.join(repoRoot, "src", "db", "postgresConnection.ts"),
    "utf8",
  );

  assert.match(
    postgresConnectionSource,
    /async function initializePool\(\)/,
    "postgresConnection.ts should export an initializePool function",
  );
  assert.match(
    postgresConnectionSource,
    /await client\.query\(["']SELECT 1["']\)/,
    "initializePool should verify connectivity with a lightweight SELECT 1",
  );
});

test("Prometheus alert rules are versioned in the repo for the key production failure modes", () => {
  const alertRules = fs.readFileSync(
    path.join(repoRoot, "alerts", "prometheus-rules.yml"),
    "utf8",
  );

  assert.match(alertRules, /microfinance_payment_failure_total\{reason="b2c\.core_failed"\}/);
  assert.match(alertRules, /microfinance_db_pool_exhausted\{pool="primary"\}/);
  assert.match(alertRules, /microfinance_background_task_consecutive_failures/);
});

test("migration documentation ships a rollback runbook", () => {
  const strategyDoc = fs.readFileSync(
    path.join(repoRoot, "docs", "MIGRATION_STRATEGY.md"),
    "utf8",
  );
  const rollbackRunbook = fs.readFileSync(
    path.join(repoRoot, "docs", "runbooks", "migration-rollback.md"),
    "utf8",
  );

  assert.match(strategyDoc, /docs\/runbooks\/migration-rollback\.md/);
  assert.match(rollbackRunbook, /Mode A: code rollback only/);
  assert.match(rollbackRunbook, /Mode B: database restore/);
  assert.match(rollbackRunbook, /Mode C: compensating forward migration/);
});
