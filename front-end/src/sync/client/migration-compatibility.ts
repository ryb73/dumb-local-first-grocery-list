import type { MergedDB, MigrationState } from "@grocery-list/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Gets the latest applied migration name from a Kysely migration table.
 * Returns null if no migrations have been applied.
 */
async function getLatestMigration(
  db: Kysely<any>,
  tableName = `kysely_migration`
): Promise<string | null> {
  const result = await sql<{ name: string }>`
      SELECT name
      FROM ${sql.table(tableName)}
      ORDER BY timestamp DESC
      LIMIT 1
    `.execute(db);

  return result.rows[0]?.name ?? null;
}

/**
 * Gets the migration state for both main and operation log databases on the client.
 */
export async function getClientMigrationState(
  clientDb: Kysely<MergedDB>
): Promise<MigrationState> {
  const mainMigration = await getLatestMigration(clientDb, `kysely_migration`);
  const operationLogMigration = await getLatestMigration(
    clientDb,
    `op_log.kysely_migration`
  );

  return {
    mainMigration,
    operationLogMigration,
  };
}
