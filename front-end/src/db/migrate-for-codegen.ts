import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../../db";
import { createMigrator } from "./migrations/createMigrator.ts";
import { migrationScript } from "./migrationScript.ts";

async function migrate() {
  const db = new Kysely<DB>({
    dialect: new SqliteDialect({
      database: BetterSqlite3(`local-db-for-codegen.sqlite3`),
    }),
  });

  await migrationScript(db, createMigrator(db, true));
}

await migrate();
