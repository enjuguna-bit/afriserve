import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const testsRoot = path.join(repoRoot, "tests");

function toPosixPath(value) {
  return String(value || "").replace(/\\/g, "/");
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function globToRegex(pattern) {
  let regex = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const current = pattern[index];
    const next = pattern[index + 1];

    if (current === "*") {
      if (next === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    regex += escapeRegex(current);
  }
  return new RegExp(`${regex}$`);
}

function listFilesRecursively(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursively(absolutePath));
      continue;
    }
    files.push(absolutePath);
  }

  return files;
}

function resolveTestFiles(patterns) {
  const allTestFiles = listFilesRecursively(testsRoot)
    .filter((filePath) => /\.test\.(ts|tsx|js|mjs|cjs)$/i.test(filePath))
    .map((filePath) => ({
      absolutePath: filePath,
      relativePath: toPosixPath(path.relative(repoRoot, filePath)),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  if (patterns.length === 0) {
    return allTestFiles.map((entry) => entry.absolutePath);
  }

  const matchers = patterns.map((pattern) => globToRegex(toPosixPath(pattern)));
  const matched = allTestFiles
    .filter((entry) => matchers.some((matcher) => matcher.test(entry.relativePath)))
    .map((entry) => entry.absolutePath);

  return [...new Set(matched)];
}

const requestedPatterns = process.argv.slice(2);
const matchedFiles = resolveTestFiles(requestedPatterns);
const perFileTimeoutMs = Number.parseInt(process.env.TEST_FILE_TIMEOUT_MS || "360000", 10);

if (matchedFiles.length === 0) {
  const label = requestedPatterns.length > 0
    ? `patterns: ${requestedPatterns.join(", ")}`
    : "the tests directory";
  console.error(`No test files matched ${label}.`);
  process.exit(1);
}

function runTestFile(testFilePath, { forceExit = false } = {}) {
  const args = ["--import", "tsx", "--test"];
  if (forceExit) {
    args.push("--test-force-exit");
  }
  args.push("--test-concurrency=1", testFilePath);

  const result = spawnSync(
    process.execPath,
    args,
    {
      cwd: repoRoot,
      stdio: "inherit",
      env: process.env,
      timeout: perFileTimeoutMs,
    },
  );

  if (result.error && result.error.code !== "ETIMEDOUT") {
    throw result.error;
  }

  return {
    status: result.status ?? 1,
    timedOut: result.error?.code === "ETIMEDOUT",
  };
}

const failedFiles = [];

for (const matchedFile of matchedFiles) {
  let result = runTestFile(matchedFile);

  if (result.timedOut) {
    const relativePath = toPosixPath(path.relative(repoRoot, matchedFile));
    console.warn(`Test file timed out without forced exit; retrying with --test-force-exit: ${relativePath}`);
    result = runTestFile(matchedFile, { forceExit: true });
  }

  if (result.status !== 0) {
    failedFiles.push(matchedFile);
  }
}

if (failedFiles.length > 0) {
  console.error("Test run failed for:");
  for (const failedFile of failedFiles) {
    console.error(` - ${toPosixPath(path.relative(repoRoot, failedFile))}`);
  }
  process.exit(1);
}

process.exit(0);
