import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { createMigrator } from "./createMigrator.js";
import { migrationScript } from "./migrationScript.js";
import { MainDB } from "../index.js";

async function migrate() {
  const db = new Kysely<MainDB>({
    dialect: new SqliteDialect({
      database: BetterSqlite3(`local-db-for-codegen.sqlite3`),
    }),
  });

  await migrationScript(db, createMigrator(db, true));
}

await migrate();
