import { Kysely, sql } from "kysely";
import type { Dialect } from "kysely";
import type { DB } from "../../db";
import type { DB as OperationLogDB } from "../../operation-log-db";
import type { MergedDB } from "./merged-db";
import { createMigrator } from "./migrations/createMigrator";
import { createOperationLogMigrator } from "./operation-log/migrations/createOperationLogMigrator";

// Initialize a specific database with migrations
const initDatabase = async (dialect: Dialect, migrate = false) => {
  const kysely = new Kysely<DB>({ dialect });

  if (migrate || import.meta.env[`MIGRATE_ON_INIT`] === `true`) {
    const migrator = createMigrator(kysely);

    const { error } = await migrator.migrateToLatest();

    if (error != null) {
      console.error(`Migration failed:`, error);
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw error;
    }
  }

  return kysely;
};

// Initialize operation log database with migrations
const initOperationLogDatabase = async (dialect: Dialect, migrate = false) => {
  const kysely = new Kysely<OperationLogDB>({ dialect });

  if (migrate || import.meta.env[`MIGRATE_ON_INIT`] === `true`) {
    const migrator = createOperationLogMigrator(kysely);

    const { error } = await migrator.migrateToLatest();

    if (error != null) {
      console.error(`Operation log migration failed:`, error);
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw error;
    }
  }

  return kysely;
};

// Initialize merged database with both main and operation log databases attached
export const initMergedDatabase = async (
  operationLogDbName: string,
  mainDialect: Dialect,
  operationLogDialect: Dialect,
  migrate = false
) => {
  // Initialize both databases separately first to run migrations
  const mainDb = await initDatabase(mainDialect, migrate);
  const operationLogDb = await initOperationLogDatabase(
    operationLogDialect,
    migrate
  );

  // Close the separate operation log connection since we'll attach it to main
  await operationLogDb.destroy();

  // Attach the operation log database to the main database
  await sql`ATTACH DATABASE ${operationLogDbName} AS op_log`.execute(mainDb);

  // Return the main kysely instance typed as MergedDB
  return mainDb as unknown as Kysely<MergedDB>;
};

// Initialize both databases for testing
export const initTestDatabases = async (
  dialect1: Dialect,
  dialect2: Dialect
) => {
  const db1 = await initDatabase(dialect1);
  const db2 = await initDatabase(dialect2);
  return { db1, db2 };
};
