import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";
import { z } from "zod";

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
    "2025-08-16_01": {
      productionReady: true,
      description: `Dummy migration to test migration compatibility`,
      migration: {
        up: async () => {
          // Do nothing
        },
        down: async () => {
          // Do nothing
        },
      },
    },
    "2025-08-19_01": {
      productionReady: true,
      description: `Fix createItem payload schema: rename created_at to createdAt`,
      migration: {
        up: async (db: Kysely<any>) => {
          // Define the old schema with snake_case created_at
          const oldCreateItemPayloadSchema = z.object({
            item: z.object({
              created_at: z.number(),
              id: z.string(),
              name: z.string(),
            }),
          });

          // Define the new schema with camelCase createdAt
          const newCreateItemPayloadSchema = z.object({
            item: z.object({
              createdAt: z.number(),
              id: z.string(),
              name: z.string(),
            }),
          });

          // Get all createItem operations
          const createItemRows = await db
            .selectFrom(`operations`)
            .selectAll()
            .where(`type`, `=`, `createItem`)
            .execute();

          // Process each row
          for (const row of createItemRows) {
            // Parse the JSON payload
            const payload = JSON.parse(row[`payload`] as string);

            // Check if it matches the old schema
            const oldSchemaResult =
              oldCreateItemPayloadSchema.safeParse(payload);

            if (oldSchemaResult.success) {
              // Convert to new schema
              const newPayload = {
                item: {
                  createdAt: oldSchemaResult.data.item.created_at,
                  id: oldSchemaResult.data.item.id,
                  name: oldSchemaResult.data.item.name,
                },
              };

              // Validate the new payload matches the expected schema
              newCreateItemPayloadSchema.parse(newPayload);

              // Update the row with the new payload
              // eslint-disable-next-line no-await-in-loop
              await db
                .updateTable(`operations`)
                .set({
                  payload: JSON.stringify(newPayload),
                })
                .where(`id`, `=`, row[`id`] as string)
                .execute();
            }
            // If it doesn't match the old schema, it might already be in the new format
          }
        },
        down: async (db: Kysely<any>) => {
          // Define the schemas (reversed for downgrade)
          const newCreateItemPayloadSchema = z.object({
            item: z.object({
              createdAt: z.number(),
              id: z.string(),
              name: z.string(),
            }),
          });

          const oldCreateItemPayloadSchema = z.object({
            item: z.object({
              created_at: z.number(),
              id: z.string(),
              name: z.string(),
            }),
          });

          // Get all createItem operations
          const createItemRows = await db
            .selectFrom(`operations`)
            .selectAll()
            .where(`type`, `=`, `createItem`)
            .execute();

          // Process each row (reverse the transformation)
          for (const row of createItemRows) {
            const payload = JSON.parse(row[`payload`] as string);

            // Check if it matches the new schema (camelCase)
            const newSchemaResult =
              newCreateItemPayloadSchema.safeParse(payload);

            if (newSchemaResult.success) {
              // Convert back to old schema
              const oldPayload = {
                item: {
                  created_at: newSchemaResult.data.item.createdAt,
                  id: newSchemaResult.data.item.id,
                  name: newSchemaResult.data.item.name,
                },
              };

              // Validate the old payload
              oldCreateItemPayloadSchema.parse(oldPayload);

              // Update the row with the old payload format
              // eslint-disable-next-line no-await-in-loop
              await db
                .updateTable(`operations`)
                .set({
                  payload: JSON.stringify(oldPayload),
                })
                .where(`id`, `=`, row[`id`] as string)
                .execute();
            }
          }
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
