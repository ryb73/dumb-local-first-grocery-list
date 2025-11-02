import type { MergedDB, MigrationState } from "@grocery-list/shared";
import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";

/**
 * Gets the latest applied migration name from a Kysely migration table.
 * Returns null if no migrations have been applied.
 */
async function getLatestMigration(
  db: Kysely<any> | Transaction<any>,
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
 *
 * @param trx - The transaction to execute within
 */
export async function getServerMigrationState(
  trx: Transaction<MergedDB>
): Promise<MigrationState> {
  const [mainMigration, operationLogMigration] = await Promise.all([
    getLatestMigration(trx, `kysely_migration`),
    getLatestMigration(trx, `op_log.kysely_migration`),
  ]);

  return {
    mainMigration,
    operationLogMigration,
  };
}
