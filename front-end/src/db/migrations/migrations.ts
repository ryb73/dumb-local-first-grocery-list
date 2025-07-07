import type { Kysely, Migration } from "kysely";
import { sql } from "kysely";

type MigrationDefinition = {
  description: string;
  migration: Migration;
  /**
   * Whether the migration is ready to be run in production.
   *
   * If false, the migration will not be run in the browser app.
   * If true, the migration will be run in the browser app.
   *
   * When working on a new migration, ALWAYS set this to false! DO NOT
   * SET THIS TO TRUE UNLESS YOU KNOW WHAT YOU ARE DOING!
   */
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
  "2025-05-31": {
    productionReady: true,
    description: `Invert the meaning of "checked" and rename "last_unchecked_at" to "last_checked_at"`,
    migration: {
      up: async (db: Kysely<any>) => {
        // Rename `last_unchecked_at` to `last_checked_at`
        await db.schema
          .alterTable(`items`)
          .renameColumn(`last_unchecked_at`, `last_checked_at`)
          .execute();

        // Create a temporary column to hold the inverted `checked` value, defaulting to 0.
        await db.schema
          .alterTable(`items`)
          .addColumn(`checked_temp`, `integer`, (col) =>
            col.notNull().defaultTo(0)
          )
          .execute();
        await db
          .updateTable(`items`)
          .set({ checked_temp: sql`CASE WHEN checked = 1 THEN 0 ELSE 1 END` })
          .execute();
        await db.schema.alterTable(`items`).dropColumn(`checked`).execute();
        await db.schema
          .alterTable(`items`)
          .renameColumn(`checked_temp`, `checked`)
          .execute();
      },
      down: async (db: Kysely<any>) => {
        // Rename `last_checked_at` back to `last_unchecked_at`
        await db.schema
          .alterTable(`items`)
          .renameColumn(`last_checked_at`, `last_unchecked_at`)
          .execute();

        // Invert `checked` values and default back
        await db.schema
          .alterTable(`items`)
          .addColumn(`checked_temp`, `integer`, (col) =>
            col.notNull().defaultTo(1)
          )
          .execute();
        await db
          .updateTable(`items`)
          .set({ checked_temp: sql`CASE WHEN checked = 1 THEN 0 ELSE 1 END` })
          .execute();
        await db.schema.alterTable(`items`).dropColumn(`checked`).execute();
        await db.schema
          .alterTable(`items`)
          .renameColumn(`checked_temp`, `checked`)
          .execute();
      },
    },
  },
  "2025-07-07": {
    productionReady: true,
    description: `Make items.created_at non-nullable, and update existing NULLs to 0.`,
    migration: {
      up: async (db: Kysely<any>) => {
        // SQLite does not allow adding a column with a non-constant default
        // value (like CURRENT_TIMESTAMP) to an existing table. The recommended
        // workaround is to create a new table with the desired schema, copy
        // the data from the old table, and then replace the old table with
        // the new one.
        await db.schema
          .createTable(`items_temp`)
          .addColumn(`id`, `text`, (col) => col.primaryKey())
          .addColumn(`name`, `text`, (col) => col.notNull().unique())
          .addColumn(`checked`, `integer`, (col) => col.notNull().defaultTo(0))
          .addColumn(`created_at`, `integer`, (col) =>
            col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
          )
          .addColumn(`last_checked_at`, `integer`)
          .modifyEnd(sql`STRICT`)
          .execute();

        // Copy data from the old table to the new one, providing a default
        // for any existing NULL created_at values.
        await db
          .insertInto(`items_temp`)
          .columns([`id`, `name`, `checked`, `last_checked_at`, `created_at`])
          .expression((eb) =>
            eb
              .selectFrom(`items`)
              .select([
                `id`,
                `name`,
                `checked`,
                `last_checked_at`,
                sql`COALESCE(created_at, 0)`.as(`created_at`),
              ])
          )
          .execute();

        await db.schema.dropTable(`items`).execute();

        await db.schema.alterTable(`items_temp`).renameTo(`items`).execute();
      },
      down: async (db: Kysely<any>) => {
        // Revert the changes by creating a table with a nullable created_at column.
        await db.schema
          .createTable(`items_temp`)
          .addColumn(`id`, `text`, (col) => col.primaryKey())
          .addColumn(`name`, `text`, (col) => col.notNull().unique())
          .addColumn(`checked`, `integer`, (col) => col.notNull().defaultTo(0))
          .addColumn(`created_at`, `integer`)
          .addColumn(`last_checked_at`, `integer`)
          .modifyEnd(sql`STRICT`)
          .execute();

        await db
          .insertInto(`items_temp`)
          .expression((eb) => eb.selectFrom(`items`).selectAll())
          .execute();

        await db.schema.dropTable(`items`).execute();

        await db.schema.alterTable(`items_temp`).renameTo(`items`).execute();
      },
    },
  },
};

const filteredMigrations = Object.fromEntries(
  Object.entries(migrations)
    .filter(([, migration]) => migration.productionReady)
    .map(([key, migration]) => [key, migration.migration])
);
const devMigrations = Object.fromEntries(
  Object.entries(migrations).map(([key, migration]) => [
    key,
    migration.migration,
  ])
);
export { filteredMigrations as migrations, devMigrations };
