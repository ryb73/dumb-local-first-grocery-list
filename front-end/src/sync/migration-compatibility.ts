import type { Kysely } from "kysely";
import { sql } from "kysely";
import { SQLocalKysely } from "sqlocal/kysely";
import { initMergedDatabase } from "../db/init";
import type { MergedDB } from "../db/merged-db";

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
 * Result of a migration compatibility check between client and server.
 */
export type MigrationCompatibilityResult = {
  /** Whether the client and server migration states are compatible */
  compatible: boolean;
  /** The client's migration state */
  clientState: MigrationState;
  /** The server's migration state */
  serverState: MigrationState;
  /** Human-readable error message if incompatible */
  errorMessage?: string;
};

/**
 * Gets the latest applied migration name from a Kysely migration table.
 * Returns null if no migrations have been applied.
 */
async function getLatestMigration(
  db: Kysely<any>,
  tableName = `kysely_migration`
): Promise<string | null> {
  try {
    const result = await sql<{ name: string }>`
      SELECT name
      FROM ${sql.table(tableName)}
      ORDER BY timestamp DESC
      LIMIT 1
    `.execute(db);

    return result.rows[0]?.name ?? null;
  } catch (error) {
    // If the migration table doesn't exist, no migrations have been applied
    if (error instanceof Error) {
      if (error.message.includes(`no such table`)) {
        return null;
      }

      throw error;
    }

    throw new Error(`Failed to get latest migration: ${String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Gets the migration state for both main and operation log databases.
 */
export async function getMigrationState(
  db: Kysely<MergedDB>
): Promise<MigrationState> {
  const [mainMigration, operationLogMigration] = await Promise.all([
    getLatestMigration(db, `kysely_migration`),
    getLatestMigration(db, `op_log.kysely_migration`),
  ]);

  return {
    mainMigration,
    operationLogMigration,
  };
}

/**
 * Creates a connection to the server database.
 */
async function getServerDatabase(): Promise<Kysely<MergedDB>> {
  return await initMergedDatabase(
    `grocery-list-2.log.sqlite3`,
    new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
    new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect
  );
}

/**
 * Checks if the client and server have compatible migration states.
 * Both the main database and operation log database migration states must match.
 *
 * This function simulates a server API call by creating its own server database instance.
 */
export async function checkMigrationCompatibility(
  clientDb: Kysely<MergedDB>
): Promise<MigrationCompatibilityResult> {
  // Simulate server API call by creating server database instance
  const serverDb = await getServerDatabase();

  try {
    const [clientState, serverState] = await Promise.all([
      getMigrationState(clientDb),
      getMigrationState(serverDb),
    ]);

    const mainCompatible =
      clientState.mainMigration === serverState.mainMigration;
    const opLogCompatible =
      clientState.operationLogMigration === serverState.operationLogMigration;

    const compatible = mainCompatible && opLogCompatible;

    if (!compatible) {
      const messages: string[] = [];

      if (!mainCompatible) {
        messages.push(
          `Main database: client=${
            clientState.mainMigration ?? `none`
          }, server=${serverState.mainMigration ?? `none`}`
        );
      }

      if (!opLogCompatible) {
        messages.push(
          `Operation log: client=${
            clientState.operationLogMigration ?? `none`
          }, server=${serverState.operationLogMigration ?? `none`}`
        );
      }

      return {
        compatible: false,
        clientState,
        serverState,
        errorMessage: `Migration version mismatch. ${messages.join(`; `)}`,
      };
    }

    return {
      compatible: true,
      clientState,
      serverState,
    };
  } finally {
    // Clean up server database connection
    await serverDb.destroy();
  }
}
