import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import { getServerDatabase } from "./database";

/**
 * Represents the migration state of a database.
 */
export type MigrationState = {
  /** The highest applied migration name for the main database */
  mainMigration: string | null;
  /** The highest applied migration name for the operation log database */
  operationLogMigration: string | null;
};

/**
 * Gets the latest applied migration name from a Kysely migration table.
 * Returns null if no migrations have been applied.
 */
async function getLatestMigration(
  db: Kysely<any>,
  tableName = `kysely_migration`
) {
  const result = await sql<{ name: string }>`
      SELECT name
      FROM ${sql.table(tableName)}
      ORDER BY timestamp DESC
      LIMIT 1
    `.execute(db);

  return result.rows[0]?.name ?? null;
}

/**
 * Gets the migration state for both main and operation log databases on the server.
 */
async function getServerMigrationStateFromDb(serverDb: Kysely<MergedDB>) {
  const [mainMigration, operationLogMigration] = await Promise.all([
    getLatestMigration(serverDb, `kysely_migration`),
    getLatestMigration(serverDb, `op_log.kysely_migration`),
  ]);

  return {
    mainMigration,
    operationLogMigration,
  };
}

/**
 * Gets the server's migration state.
 * This is the server-side implementation that would run on the actual server.
 */
export async function getServerMigrationState(): Promise<MigrationState> {
  const serverDb = await getServerDatabase();

  try {
    return await getServerMigrationStateFromDb(serverDb);
  } finally {
    await serverDb.destroy();
  }
}
