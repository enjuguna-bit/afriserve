import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const sqliteSchemaPath = path.join(repoRoot, "prisma", "schema.prisma");
const postgresPrismaDir = path.join(repoRoot, "prisma", "postgres");
const postgresSchemaPath = path.join(postgresPrismaDir, "schema.prisma");
const generatedPrismaDir = path.join(repoRoot, "generated", "prisma");
const sqliteBootstrapSqlPath = path.join(generatedPrismaDir, "sqlite-bootstrap.sql");

// Explicitly load .env if present to ensure DATABASE_URL is avail for spawnSync on Windows
if (fs.existsSync(path.join(repoRoot, ".env"))) {
  console.log("Loading .env in prisma-manager.mjs...");
  const envLines = fs.readFileSync(path.join(repoRoot, ".env"), "utf8").split(/\r?\n/);
  for (const line of envLines) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2].trim().replace(/^['"](.*)['"]$/, "$1");
      if (!process.env[key]) {
        console.log(`Setting process.env[${key}] from .env`);
        process.env[key] = val;
      }
    }
  }
}
console.log("DATABASE_URL check:", process.env.DATABASE_URL ? "SET" : "MISSING");

function resolveDbClient() {
  const normalized = String(process.env.PRISMA_DB_CLIENT || process.env.DB_CLIENT || "sqlite").trim().toLowerCase();
  return normalized === "postgres" ? "postgres" : "sqlite";
}

function runPrisma(args) {
  const commandConfig = process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npx", "prisma", ...args] }
    : { command: "npx", args: ["prisma", ...args] };
  const result = spawnSync(commandConfig.command, commandConfig.args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function runPrismaCapture(args) {
  const commandConfig = process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", "npx", "prisma", ...args] }
    : { command: "npx", args: ["prisma", ...args] };
  const result = spawnSync(commandConfig.command, commandConfig.args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "inherit"],
    encoding: "utf8",
    env: process.env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }

  return String(result.stdout || "");
}

function ensurePostgresSchema() {
  const sqliteSchema = fs.readFileSync(sqliteSchemaPath, "utf8");
  const lines = sqliteSchema.split(/\r?\n/);
  const postgresLines = [];

  for (const line of lines) {
    let nextLine = line;

    if (/^\s*output\s*=\s*"\.\.\/generated\/prisma\/sqlite-client"\s*$/.test(nextLine)) {
      nextLine = '  output   = "../../generated/prisma/postgres-client"';
    } else if (/^\s*provider\s*=\s*"sqlite"\s*$/.test(nextLine)) {
      nextLine = '  provider = "postgresql"';
    } else {
      const scalarFieldMatch = nextLine.match(/^(\s*[A-Za-z_][A-Za-z0-9_]*\s+)(Decimal|DateTime)(\??)(.*)$/);
      if (scalarFieldMatch) {
        const [, prefix, scalarType, optionalSuffix, remainder] = scalarFieldMatch;
        if (scalarType === "Decimal" && !remainder.includes("@db.Decimal")) {
          nextLine = `${prefix}${scalarType}${optionalSuffix}${remainder} @db.Decimal(18,4)`;
        } else if (scalarType === "DateTime" && !remainder.includes("@db.Timestamptz")) {
          nextLine = `${prefix}${scalarType}${optionalSuffix}${remainder} @db.Timestamptz(3)`;
        }
      }
    }

    postgresLines.push(nextLine);
  }

  const postgresSchema = [
    "// AUTO-GENERATED. Run `node scripts/prisma-manager.mjs generate-clients` after schema changes.",
    ...postgresLines,
  ].join("\n");

  fs.mkdirSync(postgresPrismaDir, { recursive: true });
  fs.writeFileSync(postgresSchemaPath, postgresSchema);
}

function ensureSqliteBootstrapSql() {
  const bootstrapSql = runPrismaCapture([
    "migrate",
    "diff",
    "--from-empty",
    "--to-schema-datamodel",
    sqliteSchemaPath,
    "--script",
  ]);

  if (!bootstrapSql.trim()) {
    throw new Error("Prisma did not return SQLite bootstrap SQL.");
  }

  fs.mkdirSync(generatedPrismaDir, { recursive: true });
  fs.writeFileSync(sqliteBootstrapSqlPath, bootstrapSql);
}

function selectedSchemaPath() {
  return resolveDbClient() === "postgres" ? postgresSchemaPath : sqliteSchemaPath;
}

function generateClients() {
  ensurePostgresSchema();
  runPrisma(["generate", "--schema", sqliteSchemaPath]);
  runPrisma(["generate", "--schema", postgresSchemaPath]);
  ensureSqliteBootstrapSql();
}

function runSelectedPrismaCommand(commandParts) {
  ensurePostgresSchema();
  runPrisma([...commandParts, "--schema", selectedSchemaPath()]);
}

const subcommand = String(process.argv[2] || "generate-clients").trim().toLowerCase();

switch (subcommand) {
  case "generate-clients":
    generateClients();
    break;
  case "generate-schema":
    ensurePostgresSchema();
    ensureSqliteBootstrapSql();
    break;
  case "validate":
    runSelectedPrismaCommand(["validate"]);
    break;
  case "db-push":
    runSelectedPrismaCommand(["db", "push", "--skip-generate"]);
    break;
  case "migrate-dev":
    runSelectedPrismaCommand(["migrate", "dev"]);
    break;
  case "migrate-reset":
    runSelectedPrismaCommand(["migrate", "reset", "--force"]);
    break;
  default:
    throw new Error(`Unsupported prisma-manager command: ${subcommand}`);
}
