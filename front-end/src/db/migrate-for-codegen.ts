import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../../db";
import { createMigrator } from "./migrations/createMigrator.ts";

async function migrate() {
  try {
    const db = new Kysely<DB>({
      dialect: new SqliteDialect({
        database: BetterSqlite3(`local-db-for-codegen.sqlite3`),
      }),
    });

    const migrator = createMigrator(db, true);
    const { error, results } = await migrator.migrateToLatest();

    if (error != null) {
      console.error(`Migration failed:`, error);
      process.exit(1);
    }

    if (results != null) {
      console.log(`Migration results:`, results);
    }

    await db.destroy();
  } catch (error) {
    console.error(`Error during migration:`, error);
    process.exit(1);
  }
}

await migrate();
