import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely } from "kysely";
import { createMigrator } from "./migrations/createMigrator";
import { DB } from "../../db";

// Initialize a specific database with migrations
const initDatabase = async (dbName: string = "grocery-list.sqlite3") => {
  const { dialect } = new SQLocalKysely(dbName);

  const kysely = new Kysely<DB>({ dialect });

  const migrator = createMigrator(kysely);

  const { error, results } = await migrator.migrateToLatest();

  if (error) {
    console.error("Migration failed:", error);
    throw error;
  }

  if (results?.length) {
    console.log("Migrations completed:", results);
  } else {
    console.log("No migrations were needed");
  }

  return { kysely, migrator };
};

// Initialize both databases for testing
export const initTestDatabases = async () => {
  const db1 = await initDatabase("grocery-list.sqlite3");
  const db2 = await initDatabase("grocery-list-2.sqlite3");
  return { db1, db2 };
};
