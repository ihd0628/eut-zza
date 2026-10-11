import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { PoolClient } from "pg";
import { closeDatabase, pool } from "./db.js";

const MIGRATIONS_DIRECTORY = resolve(process.cwd(), "sql");
const MIGRATION_FILENAME_PATTERN = /^\d{3}-.+\.sql$/;
const MIGRATION_LOCK_NAME = "eut-zza-schema-migrations";

type AppliedMigration = {
  filename: string;
  checksum: string;
};

type MigrationFile = {
  filename: string;
  checksum: string;
  sql: string;
};

const calculateChecksum = (sql: string): string =>
  createHash("sha256").update(sql).digest("hex");

const readMigrationFiles = async (): Promise<MigrationFile[]> => {
  const directoryEntries = await readdir(MIGRATIONS_DIRECTORY, {
    withFileTypes: true,
  });
  const filenames = directoryEntries
    .filter(
      (entry) =>
        entry.isFile() && MIGRATION_FILENAME_PATTERN.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (filename) => {
      const sql = await readFile(resolve(MIGRATIONS_DIRECTORY, filename), "utf8");

      return {
        filename,
        checksum: calculateChecksum(sql),
        sql,
      };
    }),
  );
};

const createMigrationHistoryTable = async (
  client: PoolClient,
): Promise<void> => {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getAppliedMigrations = async (
  client: PoolClient,
): Promise<Map<string, string>> => {
  const result = await client.query<AppliedMigration>(`
    SELECT filename, checksum
    FROM schema_migrations
    ORDER BY filename ASC
  `);

  return new Map(
    result.rows.map((migration) => [migration.filename, migration.checksum]),
  );
};

const applyMigration = async (
  client: PoolClient,
  migration: MigrationFile,
): Promise<void> => {
  await client.query("BEGIN");

  try {
    await client.query(migration.sql);
    await client.query(
      `
        INSERT INTO schema_migrations (filename, checksum)
        VALUES ($1, $2)
      `,
      [migration.filename, migration.checksum],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};

const runMigrations = async (): Promise<void> => {
  let client: PoolClient | null = null;
  let migrationLockAcquired = false;

  try {
    client = await pool.connect();

    const lockResult = await client.query<{ acquired: boolean }>(
      `
        SELECT pg_try_advisory_lock(
          hashtextextended($1, 0)
        ) AS acquired
      `,
      [MIGRATION_LOCK_NAME],
    );
    migrationLockAcquired = lockResult.rows[0]?.acquired === true;

    if (!migrationLockAcquired) {
      throw new Error("Another migration process is already running");
    }

    await createMigrationHistoryTable(client);

    const [migrationFiles, appliedMigrations] = await Promise.all([
      readMigrationFiles(),
      getAppliedMigrations(client),
    ]);

    if (migrationFiles.length === 0) {
      throw new Error(`No migration files found in ${MIGRATIONS_DIRECTORY}`);
    }

    for (const migration of migrationFiles) {
      const appliedChecksum = appliedMigrations.get(migration.filename);

      if (appliedChecksum !== undefined) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(
            `Applied migration was modified: ${migration.filename}`,
          );
        }

        console.log(`[Migration] skipped ${migration.filename}`);
        continue;
      }

      await applyMigration(client, migration);
      console.log(`[Migration] applied ${migration.filename}`);
    }

    console.log("[Migration] database schema is up to date");
  } finally {
    try {
      if (client !== null && migrationLockAcquired) {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [MIGRATION_LOCK_NAME],
        );
      }
    } finally {
      client?.release();
      await closeDatabase();
    }
  }
};

void runMigrations().catch((error: unknown) => {
  console.error("[Migration] failed", error);
  process.exitCode = 1;
});
