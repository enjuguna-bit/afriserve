import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { wait, startServer, api, loginAsAdmin } from "./integration-helpers.js";
test("manual backup endpoint reports disabled strategy by default", async () => {
  const { baseUrl, stop } = await startServer();

  try {
    const adminToken = await loginAsAdmin(baseUrl);
    const backupResponse = await api(baseUrl, "/api/system/backup", {
      method: "POST",
      token: adminToken,
    });

    assert.equal(backupResponse.status, 409);
    assert.equal(backupResponse.data.reason, "backup_disabled");
  } finally {
    await stop();
  }
});

test("manual backup endpoint creates backup files when strategy is enabled", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-backup-"));
  const dbPath = path.join(tempRoot, "integration.db");
  const backupDir = path.join(tempRoot, "backups");
  const { baseUrl, stop } = await startServer({
    envOverrides: {
      DB_PATH: dbPath,
      DB_BACKUP_ENABLED: "true",
      DB_BACKUP_DIR: backupDir,
      DB_BACKUP_INTERVAL_MS: "86400000",
      DB_BACKUP_RETENTION_COUNT: "5",
    },
  });

  try {
    const adminToken = await loginAsAdmin(baseUrl);

    await wait(10);
    const backupResponse = await api(baseUrl, "/api/system/backup", {
      method: "POST",
      token: adminToken,
    });

    assert.equal(backupResponse.status, 201);
    assert.equal(typeof backupResponse.data.backupPath, "string");
    assert.ok(backupResponse.data.backupPath.includes("backups"));
    assert.ok(fs.existsSync(backupResponse.data.backupPath));

    const health = await api(baseUrl, "/health/details");
    assert.equal(health.status, 200);
    assert.equal(health.data.backups.enabled, true);
    assert.equal(health.data.backups.directory, backupDir);
    assert.equal(typeof health.data.backups.lastBackupPath, "string");

    const backupFiles = fs.readdirSync(backupDir).filter((name) => name.endsWith(".backup.sqlite"));
    assert.ok(backupFiles.length >= 1);
  } finally {
    await stop();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
