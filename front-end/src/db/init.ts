import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely, Migrator } from "kysely";
import { KyselySchema } from "./types";
import { migrations } from "./migrations/migrations";

// Initialize a specific database with migrations
const initDatabase = async (dbName: string = "grocery-list.sqlite3") => {
  const { dialect } = new SQLocalKysely(dbName);

  const kysely = new Kysely<KyselySchema>({ dialect });

  const migrator = new Migrator({
    db: kysely,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });

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
