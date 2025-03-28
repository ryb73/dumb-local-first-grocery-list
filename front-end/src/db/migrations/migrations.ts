import { Kysely } from 'kysely';

export const migrations = {
  '2025-03-28': {
    up: async (db: Kysely<any>) => {
      await db.schema
        .createTable('active_items')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull().unique())
        .addColumn('checked', 'integer', (col) => col.defaultTo(1))
        .addColumn('created_at', 'integer')
        .addColumn('last_unchecked_at', 'integer')
        .execute();

      await db.schema
        .createTable('removed_items')
        .ifNotExists()
        .addColumn('name', 'text', (col) => col.primaryKey())
        .execute();
    },
    down: async (db: Kysely<any>) => {
      await db.schema.dropTable('active_items').execute();
      await db.schema.dropTable('removed_items').execute();
    },
  },
  '2025-03-28_01': {
    up: async (db: Kysely<any>) => {
      // Rename active_items table to items
      await db.schema
        .alterTable('active_items')
        .renameTo('items')
        .execute();

      // Drop removed_items table
      await db.schema.dropTable('removed_items').execute();
    },
    down: async (db: Kysely<any>) => {
      // Rename items back to active_items
      await db.schema
        .alterTable('items')
        .renameTo('active_items')
        .execute();

      // Recreate removed_items table
      await db.schema
        .createTable('removed_items')
        .addColumn('name', 'text', (col) => col.primaryKey())
        .execute();
    },
  },
};
