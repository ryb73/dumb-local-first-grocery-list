import { type Kysely, Migrator } from "kysely";
import type { DB } from "./operation-log-db.js";
import {
  devOperationLogMigrations,
  operationLogMigrations,
} from "./operation-log-migrations.js";

/**
 * Creates a Kysely migrator for the operation log database.
 *
 * @param kysely - The Kysely instance connected to the operation log database
 * @param dev - Whether to include development migrations (default: false)
 * @returns A Kysely Migrator
 */
export function createOperationLogMigrator(kysely: Kysely<DB>, dev = false) {
  return new Migrator({
    db: kysely,
    provider: {
      getMigrations: () =>
        Promise.resolve(
          dev ? devOperationLogMigrations : operationLogMigrations
        ),
    },
  });
}
