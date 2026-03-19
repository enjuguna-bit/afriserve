import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDefaultSqliteDbPath } from "./utils/projectPaths.js";
import { getConfiguredDbClient } from "./utils/env.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function normalizeDatabaseEnvironment(): void {
	const dbClient = getConfiguredDbClient();
	if (dbClient !== "sqlite") {
		return;
	}

	if (
		process.env.NODE_ENV === "production" &&
		process.env.ALLOW_SQLITE_IN_PRODUCTION !== "true"
	) {
		console.error(
			"FATAL: SQLite is not allowed in production. Set DB_CLIENT=postgres or ALLOW_SQLITE_IN_PRODUCTION=true.",
		);
		process.exit(1);
	}


	const configuredDbPath = String(process.env.DB_PATH || "").trim();
	const configuredDatabaseUrl = String(process.env.DATABASE_URL || "").trim();

	if (configuredDbPath === ":memory:") {
		const tempDir = path.join(os.tmpdir(), "afriserve-inmemory-db");
		if (!fs.existsSync(tempDir)) {
			fs.mkdirSync(tempDir, { recursive: true });
		}

		const filePath = path.join(tempDir, `afriserve-${process.pid}.sqlite`);
		process.env.DB_PATH = filePath;
		process.env.DATABASE_URL = `file:${filePath.replace(/\\/g, "/")}`;
		return;
	}

	if (!configuredDbPath && !configuredDatabaseUrl) {
		const defaultDbPath = resolveDefaultSqliteDbPath(currentDir);
		process.env.DB_PATH = defaultDbPath;
		process.env.DATABASE_URL = `file:${defaultDbPath.replace(/\\/g, "/")}`;
		return;
	}

	if (configuredDbPath) {
		const normalizedDatabaseUrl = configuredDbPath.startsWith("file:")
			? configuredDbPath
			: `file:${path.resolve(configuredDbPath).replace(/\\/g, "/")}`;
		if (configuredDatabaseUrl !== normalizedDatabaseUrl) {
			process.env.DATABASE_URL = normalizedDatabaseUrl;
		}
	}
}

normalizeDatabaseEnvironment();

const { startServer } = await import("./runtime/startServer.js");
startServer();


