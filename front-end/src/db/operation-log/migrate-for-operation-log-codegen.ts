import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../../../operation-log-db";
import { migrationScript } from "../migrationScript.ts";
import { createOperationLogMigrator } from "./migrations/createOperationLogMigrator.ts";

async function migrate() {
  const db = new Kysely<DB>({
    dialect: new SqliteDialect({
      database: BetterSqlite3(`local-db-for-codegen.log.sqlite3`),
    }),
  });

  const migrator = createOperationLogMigrator(db, true);

  await migrationScript(db, migrator);
}

await migrate();
