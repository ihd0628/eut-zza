import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { closeDatabase, pool } from "./db.js";

const PRODUCTION_CATALOG_SEED_FILE = resolve(
  process.cwd(),
  "sql/seeds/001-production-catalog.sql",
);

const runProductionSeed = async (): Promise<void> => {
  let client: PoolClient | null = null;

  try {
    const sql = await readFile(PRODUCTION_CATALOG_SEED_FILE, "utf8");
    client = await pool.connect();

    await client.query("BEGIN");

    try {
      await client.query(sql);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    console.log("[Seed] production catalog is up to date");
  } finally {
    client?.release();
    await closeDatabase();
  }
};

void runProductionSeed().catch((error: unknown) => {
  console.error("[Seed] failed", error);
  process.exitCode = 1;
});
