import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

async function loadIsolatedSqliteConnection() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "afriserve-tx-safety-"));
  const dbPath = path.join(tempRoot, "transaction-safety.sqlite");
  const previousDbClient = process.env.DB_CLIENT;
  const previousDbPath = process.env.DB_PATH;

  process.env.DB_CLIENT = "sqlite";
  process.env.DB_PATH = dbPath;

  const moduleUrl = `${pathToFileURL(path.join(currentDir, "..", "src", "db", "sqliteConnection.js")).href}?case=${Date.now()}-${Math.random()}`;
  const connection = await import(moduleUrl);

  return {
    connection,
    cleanup: async () => {
      try {
        await connection.closeDb();
      } finally {
        if (typeof previousDbClient === "undefined") {
          delete process.env.DB_CLIENT;
        } else {
          process.env.DB_CLIENT = previousDbClient;
        }

        if (typeof previousDbPath === "undefined") {
          delete process.env.DB_PATH;
        } else {
          process.env.DB_PATH = previousDbPath;
        }

        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    },
  };
}

test("executeTransaction rolls back all writes when a mutation fails", async () => {
  const { connection, cleanup } = await loadIsolatedSqliteConnection();

  try {
    await connection.run("CREATE TABLE tx_safety_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");

    await assert.rejects(
      connection.executeTransaction(async (tx: any) => {
        await tx.run("INSERT INTO tx_safety_items (name) VALUES (?)", ["alpha"]);
        await tx.run("INSERT INTO tx_safety_items (name) VALUES (?)", [null]);
      }),
    );

    const rows = await connection.all("SELECT id, name FROM tx_safety_items ORDER BY id ASC");
    assert.equal(rows.length, 0);
  } finally {
    await cleanup();
  }
});

test("nested executeTransaction uses savepoints so inner rollback does not abort the outer unit of work", async () => {
  const { connection, cleanup } = await loadIsolatedSqliteConnection();

  try {
    await connection.run("CREATE TABLE tx_safety_items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)");

    await connection.executeTransaction(async (outerTx: any) => {
      await outerTx.run("INSERT INTO tx_safety_items (name) VALUES (?)", ["outer-before"]);

      await assert.rejects(
        connection.executeTransaction(async (innerTx: any) => {
          await innerTx.run("INSERT INTO tx_safety_items (name) VALUES (?)", ["inner"]);
          throw new Error("force inner rollback");
        }),
      );

      await outerTx.run("INSERT INTO tx_safety_items (name) VALUES (?)", ["outer-after"]);
    });

    const rows = await connection.all("SELECT name FROM tx_safety_items ORDER BY id ASC");
    assert.deepEqual(rows.map((row: any) => String(row.name)), ["outer-before", "outer-after"]);
  } finally {
    await cleanup();
  }
});