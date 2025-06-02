import { Kysely } from "kysely";
import { SQLocalKysely } from "sqlocal/kysely";
import type { DB } from "../../db";
import { createMigrator } from "./migrations/createMigrator";

// Initialize a specific database with migrations
const initDatabase = async (dbName = `grocery-list.sqlite3`) => {
  const { dialect } = new SQLocalKysely(dbName);

  const kysely = new Kysely<DB>({ dialect });

  const migrator = createMigrator(kysely);

  const { error, results } = await migrator.migrateToLatest();

  if (error != null) {
    console.error(`Migration failed:`, error);
    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw error;
  }

  if (results != null && results.length > 0) {
    console.log(`Migrations completed:`, results);
  } else {
    console.log(`No migrations were needed`);
  }

  return { kysely, migrator };
};

// Initialize both databases for testing
export const initTestDatabases = async () => {
  const db1 = await initDatabase(`grocery-list.sqlite3`);
  const db2 = await initDatabase(`grocery-list-2.sqlite3`);
  return { db1, db2 };
};
