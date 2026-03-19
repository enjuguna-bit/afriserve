import { existsSync } from "node:fs";
import path from "node:path";

function looksLikeRepoRoot(candidatePath: string): boolean {
  return existsSync(path.join(candidatePath, "package.json"))
    && existsSync(path.join(candidatePath, "prisma", "schema.prisma"));
}

function resolveRepoRoot(startPath: string): string {
  let currentPath = path.resolve(startPath);

  for (let index = 0; index < 8; index += 1) {
    if (looksLikeRepoRoot(currentPath)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      break;
    }
    currentPath = parentPath;
  }

  return path.resolve(startPath);
}

function resolveRepoDataDir(startPath: string): string {
  return path.join(resolveRepoRoot(startPath), "data");
}

function resolveDefaultSqliteDbPath(startPath: string): string {
  return path.join(resolveRepoDataDir(startPath), "microfinance.db");
}

function resolveDefaultBackupDir(startPath: string): string {
  return path.join(resolveRepoDataDir(startPath), "backups");
}

function resolveDefaultUploadDir(startPath: string): string {
  return path.join(resolveRepoDataDir(startPath), "uploads");
}

export {
  resolveRepoRoot,
  resolveRepoDataDir,
  resolveDefaultSqliteDbPath,
  resolveDefaultBackupDir,
  resolveDefaultUploadDir,
};
