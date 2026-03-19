import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const frontendDir = path.join(repoRoot, "frontend-next");
const frontendPackageJsonPath = path.join(frontendDir, "package.json");
const frontendNodeModulesDir = path.join(frontendDir, "node_modules");
const frontendDistDir = path.join(frontendDir, "dist");
const embeddedFrontendTargetDir = path.join(repoRoot, "dist", "frontend-next");
const skipEmbeddedFrontendBuild = String(process.env.SKIP_EMBEDDED_FRONTEND_BUILD || "").trim().toLowerCase() === "true";

function resolveCommand(args) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "npm", ...args],
    };
  }

  return {
    command: "npm",
    args,
  };
}

if (skipEmbeddedFrontendBuild || !fs.existsSync(frontendPackageJsonPath)) {
  process.exit(0);
}

function runFrontendCommand(args, envOverrides = {}) {
  const commandConfig = resolveCommand(args);
  const result = spawnSync(commandConfig.command, commandConfig.args, {
    cwd: frontendDir,
    stdio: "inherit",
    env: {
      ...process.env,
      ...envOverrides,
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

if (!fs.existsSync(frontendNodeModulesDir)) {
  runFrontendCommand(["ci"]);
}

runFrontendCommand(["run", "build"], {
  VITE_APP_ENV: String(process.env.VITE_APP_ENV || "").trim() || "production",
  VITE_API_BASE_URL: String(process.env.VITE_API_BASE_URL || "").trim() || "/api",
  VITE_API_TIMEOUT_MS: String(process.env.VITE_API_TIMEOUT_MS || "").trim() || "15000",
  VITE_LOG_LEVEL: String(process.env.VITE_LOG_LEVEL || "").trim() || "warn",
});

if (!fs.existsSync(frontendDistDir)) {
  process.exit(1);
}

fs.rmSync(embeddedFrontendTargetDir, { recursive: true, force: true });
fs.mkdirSync(path.dirname(embeddedFrontendTargetDir), { recursive: true });
fs.cpSync(frontendDistDir, embeddedFrontendTargetDir, { recursive: true });
