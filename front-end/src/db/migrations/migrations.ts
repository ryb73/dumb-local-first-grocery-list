import type { Kysely} from "kysely";
import { sql } from "kysely";

const migrations = {
  "2025-03-28": {
    productionReady: true,
    description: `Initial migration`,
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
  "2025-03-28_01": {
    productionReady: true,

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
  "2025-03-28_02": {
    productionReady: true,

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
};

const filteredMigrations = Object.fromEntries(
  Object.entries(migrations).filter(
    ([_, migration]) => migration.productionReady
  )
);
export { filteredMigrations as migrations };
