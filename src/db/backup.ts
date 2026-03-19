import fs from "node:fs";
import path from "node:path";
import { dbClient,
  db,
  dbPath,
  isInMemoryDb,
  defaultBackupDir,
  backupFileExtension,
  supportsNativeBackup, } from "./connection.js";
import type { BackupOptions, BackupResult } from "../types/dataLayer.js";

/**
 * @param {unknown} value
 * @returns {number}
 */
function normalizeRetentionCount(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 14;
  }
  return Math.floor(parsed);
}

/**
 * @param {Date} [date]
 * @returns {string}
 */
function formatBackupTimestamp(date = new Date()) {
  return date.toISOString().replace(/[.:]/g, "-");
}

/**
 * @param {string} directoryPath
 * @param {string} baseFileName
 * @param {unknown} retentionCount
 * @returns {string[]}
 */
function pruneBackupFiles(directoryPath: string, baseFileName: string, retentionCount: unknown): string[] {
  const keepCount = normalizeRetentionCount(retentionCount);

  const backupFiles = fs.readdirSync(directoryPath)
    .filter((name) => name.startsWith(`${baseFileName}-`) && name.endsWith(backupFileExtension))
    .map((name) => {
      const fullPath = path.join(directoryPath, name);
      const stats = fs.statSync(fullPath);
      return {
        fullPath,
        modifiedAtMs: stats.mtimeMs,
      };
    })
    .sort((a, b) => b.modifiedAtMs - a.modifiedAtMs);

  const deletedFiles = [];
  for (const file of backupFiles.slice(keepCount)) {
    fs.rmSync(file.fullPath, { force: true });
    deletedFiles.push(file.fullPath);
  }

  return deletedFiles;
}

/**
 * @param {BackupOptions} [options]
 * @returns {Promise<BackupResult>}
 */
async function backupDatabase(options: BackupOptions = {}): Promise<BackupResult> {
  const sqliteDb = db as { backup?: (backupPath: string) => Promise<void> } | null;
  if (dbClient !== "sqlite" || !supportsNativeBackup || !sqliteDb || typeof sqliteDb.backup !== "function") {
    return {
      skipped: true,
      reason: "backup_unsupported_for_db_client",
      backupPath: null,
      deletedFiles: [],
      createdAt: null,
    };
  }

  if (isInMemoryDb) {
    return {
      skipped: true,
      reason: "in_memory_database",
      backupPath: null,
      deletedFiles: [],
      createdAt: null,
    };
  }

  const configuredBackupDir = String(options.backupDirectory || "").trim();
  const backupDirectory = configuredBackupDir || defaultBackupDir;
  const resolvedBackupDirectory = path.resolve(backupDirectory);

  if (!fs.existsSync(resolvedBackupDirectory)) {
    fs.mkdirSync(resolvedBackupDirectory, { recursive: true });
  }

  const baseFileName = path.parse(dbPath).name || "microfinance";
  const backupPath = path.join(
    resolvedBackupDirectory,
    `${baseFileName}-${formatBackupTimestamp()}${backupFileExtension}`,
  );

  await sqliteDb.backup(backupPath);

  const deletedFiles = pruneBackupFiles(
    resolvedBackupDirectory,
    baseFileName,
    options.retentionCount,
  );

  return {
    skipped: false,
    reason: null,
    backupPath,
    deletedFiles,
    createdAt: new Date().toISOString(),
  };
}

export {
  backupDatabase,
};
