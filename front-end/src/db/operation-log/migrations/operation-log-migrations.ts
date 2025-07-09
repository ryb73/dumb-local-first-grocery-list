import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";

type OperationLogMigrationDefinition = {
  description: string;
  migration: Migration;
  /**
   * Whether the migration is ready to be run in production.
   *
   * If false, the migration will not be run in the browser app.
   * If true, the migration will be run in the browser app.
   */
  productionReady: boolean;
};

/**
 * Migration definitions for the operation log database.
 * These are executed by Kysely in alphabetical order.
 */
const operationLogMigrations: Record<string, OperationLogMigrationDefinition> =
  {
    "2025-01-20_01": {
      productionReady: true,
      description: `Create operations table for operation logging`,
      migration: {
        up: async (db: Kysely<any>) => {
          await db.schema
            .createTable(`operations`)
            .ifNotExists()
            .addColumn(`id`, `text`, (col) => col.primaryKey())
            .addColumn(`type`, `text`, (col) => col.notNull())
            .addColumn(`client_created_at`, `integer`, (col) => col.notNull())
            .addColumn(`server_committed_at`, `integer`)
            .addColumn(`payload`, `text`, (col) => col.notNull()) // JSON string
            .modifyEnd(sql`STRICT`)
            .execute();

          // Create indices for common queries
          await db.schema
            .createIndex(`idx_operations_client_created_at`)
            .on(`operations`)
            .column(`client_created_at`)
            .execute();

          await db.schema
            .createIndex(`idx_operations_server_committed_at`)
            .on(`operations`)
            .column(`server_committed_at`)
            .execute();
        },
        down: async (db: Kysely<any>) => {
          await db.schema.dropTable(`operations`).execute();
        },
      },
    },
  };

const filteredOperationLogMigrations = Object.fromEntries(
  Object.entries(operationLogMigrations)
    .filter(([, migration]) => migration.productionReady)
    .map(([key, migration]) => [key, migration.migration])
);

const devOperationLogMigrations = Object.fromEntries(
  Object.entries(operationLogMigrations).map(([key, migration]) => [
    key,
    migration.migration,
  ])
);

export {
  filteredOperationLogMigrations as operationLogMigrations,
  devOperationLogMigrations,
};
