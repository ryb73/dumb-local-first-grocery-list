import type { MergedDB } from "@grocery-list/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";
import {
  type MigrationState,
  getServerMigrationState,
} from "../server/migration-state";

/**
 * Result of a migration compatibility check between client and server.
 */
type MigrationCompatibilityResult = {
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

/**
 * Checks if the client and server have compatible migration states.
 * Both the main database and operation log database migration states must match.
 *
 * @param clientDb The client's database connection
 * @returns Promise containing compatibility result
 */
export async function checkMigrationCompatibility(
  clientDb: Kysely<MergedDB>
): Promise<MigrationCompatibilityResult> {
  // Get migration states from both client and server
  const [clientState, serverState] = await Promise.all([
    getClientMigrationState(clientDb),
    getServerMigrationState(),
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
        `Main database: client=${clientState.mainMigration ?? `none`}, server=${
          serverState.mainMigration ?? `none`
        }`
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
}
