import BetterSqlite3 from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import { migrationScript } from "./migrationScript.js";
import { createOperationLogMigrator } from "./createOperationLogMigrator.js";
import { OperationLogDB } from "../index.js";

async function migrate() {
  const db = new Kysely<OperationLogDB>({
    dialect: new SqliteDialect({
      database: BetterSqlite3(`local-db-for-codegen.log.sqlite3`),
    }),
  });

  const migrator = createOperationLogMigrator(db, true);

  await migrationScript(db, migrator);
}

await migrate();
