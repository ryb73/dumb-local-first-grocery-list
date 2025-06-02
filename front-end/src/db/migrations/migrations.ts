import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";

type MigrationDefinition = {
  description: string;
  migration: Migration;
  productionReady: boolean;
};

/**
 * This object contains all migrations for the database.
 * Migrations are executed by Kysely in alphabetical order!!!
 */
const migrations: Record<string, MigrationDefinition> = {
  "2025-03-28": {
    productionReady: true,
    description: `Initial migration`,
    migration: {
      up: async (db: Kysely<any>) => {
        await db.schema
          .createTable(`active_items`)
          .ifNotExists()
          .addColumn(`id`, `text`, (col) => col.primaryKey())
          .addColumn(`name`, `text`, (col) => col.notNull().unique())
          .addColumn(`checked`, `integer`, (col) => col.defaultTo(1))
          .addColumn(`created_at`, `integer`)
          .addColumn(`last_unchecked_at`, `integer`)
          .execute();

        await db.schema
          .createTable(`removed_items`)
          .ifNotExists()
          .addColumn(`name`, `text`, (col) => col.primaryKey())
          .execute();
      },
      down: async (db: Kysely<any>) => {
        await db.schema.dropTable(`active_items`).execute();
        await db.schema.dropTable(`removed_items`).execute();
      },
    },
  },
  "2025-03-28_01": {
    productionReady: true,
    description: `Rename active_items table to items and drop removed_items table`,
    migration: {
      up: async (db: Kysely<any>) => {
        // Rename active_items table to items
        await db.schema.alterTable(`active_items`).renameTo(`items`).execute();

        // Drop removed_items table
        await db.schema.dropTable(`removed_items`).execute();
      },
      down: async (db: Kysely<any>) => {
        // Rename items back to active_items
        await db.schema.alterTable(`items`).renameTo(`active_items`).execute();

        // Recreate removed_items table
        await db.schema
          .createTable(`removed_items`)
          .addColumn(`name`, `text`, (col) => col.primaryKey())
          .execute();
      },
    },
  },
  "2025-03-28_02": {
    productionReady: true,
    description: `Add STRICT mode to items table`,
    migration: {
      up: async (db: Kysely<any>) => {
        // TODO: remove this
        await db.schema.dropTable(`items_temp`).ifExists().execute();

        // First, create a temporary table with strict mode enabled
        await db.schema
          .createTable(`items_temp`)
          .addColumn(`id`, `text`, (col) => col.primaryKey())
          .addColumn(`name`, `text`, (col) => col.notNull().unique())
          .addColumn(`checked`, `integer`, (col) => col.defaultTo(1))
          .addColumn(`created_at`, `integer`)
          .addColumn(`last_unchecked_at`, `integer`)
          .modifyEnd(sql`STRICT`)
          .execute();

        // Copy data from original table to temporary table
        await db
          .insertInto(`items_temp`)
          .expression((eb) => eb.selectFrom(`items`).selectAll())
          .execute();

        // Drop the original table
        await db.schema.dropTable(`items`).execute();

        // Rename temporary table to original table name
        await db.schema.alterTable(`items_temp`).renameTo(`items`).execute();
      },
      down: async (db: Kysely<any>) => {
        // First, create a temporary table with the original structure
        await db.schema
          .createTable(`items_temp`)
          .addColumn(`id`, `text`, (col) => col.primaryKey())
          .addColumn(`name`, `text`, (col) => col.notNull().unique())
          .addColumn(`checked`, `integer`, (col) => col.defaultTo(1))
          .addColumn(`created_at`, `integer`)
          .addColumn(`last_unchecked_at`, `integer`)
          .execute();

        // Copy data from strict table to temporary table
        await db
          .insertInto(`items_temp`)
          .expression((eb) => eb.selectFrom(`items`).selectAll())
          .execute();

        // Drop the strict table
        await db.schema.dropTable(`items`).execute();

        // Rename temporary table to original table name
        await db.schema.alterTable(`items_temp`).renameTo(`items`).execute();
      },
    },
  },
  "2025-05-30": {
    productionReady: true,
    description: `Make items.checked non-nullable, and update existing NULLs to 0.`,
    migration: {
      up: async (db: Kysely<any>) => {
        // Add a new column with the correct constraints
        await db.schema
          .alterTable(`items`)
          .addColumn(`checked_new`, `integer`, (col) =>
            col.notNull().defaultTo(1)
          )
          .execute();

        // Update all rows to copy the coalesced checked values to the new column
        await db
          .updateTable(`items`)
          .set({ checked_new: sql`COALESCE(checked, 0)` })
          .execute();

        // Drop the old checked column
        await db.schema.alterTable(`items`).dropColumn(`checked`).execute();

        // Rename the new column to the original name
        await db.schema
          .alterTable(`items`)
          .renameColumn(`checked_new`, `checked`)
          .execute();
      },
      down: async (db: Kysely<any>) => {
        // Add the old column back (nullable with default 1)
        await db.schema
          .alterTable(`items`)
          .addColumn(`checked_old`, `integer`, (col) => col.defaultTo(1))
          .execute();

        // Copy current checked values to the old column
        await db
          .updateTable(`items`)
          .set({ checked_old: sql`checked` })
          .execute();

        // Drop the current checked column
        await db.schema.alterTable(`items`).dropColumn(`checked`).execute();

        // Rename the old column back
        await db.schema
          .alterTable(`items`)
          .renameColumn(`checked_old`, `checked`)
          .execute();
      },
    },
  },
};

const filteredMigrations = Object.fromEntries(
  Object.entries(migrations)
    .filter(([, migration]) => migration.productionReady)
    .map(([key, migration]) => [key, migration.migration])
);
export { filteredMigrations as migrations };
