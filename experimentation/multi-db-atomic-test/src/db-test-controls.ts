import { Kysely, sql, ColumnDefinitionBuilder } from "kysely";
import { SQLocalKysely } from "sqlocal/kysely";

export type LogEntry = {
  message: string;
  type: "info" | "success" | "error" | "warn";
  data?: any;
};
export type LogUpdater = (entry: LogEntry | string) => void;

// Define a simple schema for our notes tables
interface NotesTable {
  id: string;
  content: string;
}

interface Db1Schema {
  notes: NotesTable;
}

interface Db2Schema {
  notes: NotesTable;
}

const DB1_NAME = `demo-db1.sqlite3`;
const DB2_NAME = `demo-db2.sqlite3`;
const ATTACHED_DB_ALIAS = `attached_db`;

let db1Instance: Kysely<Db1Schema> | null = null;
let db2Instance: Kysely<Db2Schema> | null = null;
let isAttached = false;

function log(
  updater: LogUpdater,
  message: string,
  type: LogEntry["type"] = "info",
  data?: any
) {
  updater({ message, type, data });
}

async function initializeDatabase<T extends Record<string, any>>(
  dbName: string,
  schemaSetup: (db: Kysely<T>, logUpdater: LogUpdater) => Promise<void>,
  logUpdater: LogUpdater
): Promise<Kysely<T>> {
  log(logUpdater, `Initializing ${dbName}...`);
  const { dialect } = new SQLocalKysely(dbName);
  const kysely = new Kysely<T>({ dialect });
  await schemaSetup(kysely, logUpdater);
  log(logUpdater, `Schema setup for ${dbName} ensured.`);
  return kysely;
}

async function setupDbSchema(
  db: Kysely<Db1Schema> | Kysely<Db2Schema>,
  dbNameForLog: string,
  logUpdater: LogUpdater
) {
  await db.schema.dropTable("notes").ifExists().execute();
  await db.schema
    .createTable("notes")
    .addColumn("id", "text", (col: ColumnDefinitionBuilder) => col.primaryKey())
    .addColumn("content", "text", (col: ColumnDefinitionBuilder) =>
      col.notNull()
    )
    .execute();
  log(logUpdater, `'notes' table (re)created in ${dbNameForLog}`);
}

export async function initAndAttachDbs(
  logUpdater: LogUpdater
): Promise<boolean> {
  try {
    db1Instance = await initializeDatabase<Db1Schema>(
      DB1_NAME,
      (db, logger) => setupDbSchema(db, DB1_NAME, logger),
      logUpdater
    );
    db2Instance = await initializeDatabase<Db2Schema>(
      DB2_NAME,
      (db, logger) => setupDbSchema(db, DB2_NAME, logger),
      logUpdater
    );
    log(logUpdater, "Databases initialized.");

    if (!db1Instance) throw new Error("DB1 instance not available");
    log(
      logUpdater,
      `Attempting to ATTACH DATABASE '${DB2_NAME}' AS ${ATTACHED_DB_ALIAS} to ${DB1_NAME}...`
    );
    await sql`ATTACH DATABASE ${DB2_NAME} AS ${ATTACHED_DB_ALIAS}`.execute(
      db1Instance
    );
    isAttached = true;
    log(
      logUpdater,
      `ATTACH DATABASE command executed. Databases are now attached.`,
      "success"
    );
    return true;
  } catch (error: any) {
    log(
      logUpdater,
      `Error during DB initialization or attach: ${error.message}`,
      "error",
      error
    );
    isAttached = false;
    return false;
  }
}

export async function detachDbs(logUpdater: LogUpdater): Promise<boolean> {
  if (!db1Instance || !isAttached) {
    log(
      logUpdater,
      "Databases are not initialized or not attached. Nothing to detach.",
      "warn"
    );
    return false;
  }
  try {
    await sql`DETACH DATABASE ${ATTACHED_DB_ALIAS}`.execute(db1Instance);
    log(
      logUpdater,
      `DETACH DATABASE ${ATTACHED_DB_ALIAS} executed.`,
      "success"
    );
    isAttached = false;
    // Optionally nullify instances if you want to force re-init
    // db1Instance = null;
    // db2Instance = null;
    return true;
  } catch (error: any) {
    log(
      logUpdater,
      `Error detaching database: ${error.message}`,
      "error",
      error
    );
    return false;
  }
}

export async function clearAllTables(logUpdater: LogUpdater) {
  if (!db1Instance || !db2Instance) {
    log(logUpdater, "Databases not initialized. Cannot clear tables.", "error");
    return;
  }
  log(logUpdater, "Clearing data from tables...");
  await db1Instance.deleteFrom("notes").execute();
  await db2Instance.deleteFrom("notes").execute(); // Clear using direct instance
  log(logUpdater, "Tables cleared.", "success");
}

export async function runSuccessfulTransaction(logUpdater: LogUpdater) {
  if (!db1Instance || !db2Instance || !isAttached) {
    log(
      logUpdater,
      "Databases not initialized/attached. Run initialization first.",
      "error"
    );
    return;
  }
  log(logUpdater, "\n--- Testing Successful Transaction ---");

  const note1Id = `success-note-db1-${Date.now()}`;
  const note1Content = "Written to DB1 in successful transaction";
  const note2Id = `success-note-db2-${Date.now()}`;
  const note2Content = "Written to DB2 in successful transaction";

  try {
    await db1Instance.transaction().execute(async (trx) => {
      await trx
        .insertInto("notes")
        .values({ id: note1Id, content: note1Content })
        .execute();
      log(logUpdater, "Inserted into db1.notes within transaction.");

      await sql`INSERT INTO ${sql.table(
        ATTACHED_DB_ALIAS + ".notes"
      )} (id, content) VALUES (${note2Id}, ${note2Content})`.execute(trx);
      log(logUpdater, "Inserted into attached_db.notes within transaction.");
    });
    log(logUpdater, "Transaction committed successfully.", "success");
  } catch (error: any) {
    log(
      logUpdater,
      `Error during successful transaction test: ${error.message}`,
      "error",
      error
    );
    return;
  }

  const r1 = await db1Instance
    .selectFrom("notes")
    .where("id", "=", note1Id)
    .selectAll()
    .executeTakeFirst();
  const r2 = await db2Instance
    .selectFrom("notes")
    .where("id", "=", note2Id)
    .selectAll()
    .executeTakeFirst();

  if (r1 && r1.content === note1Content && r2 && r2.content === note2Content) {
    log(
      logUpdater,
      "VERIFICATION SUCCESS: Data verified in both databases.",
      "success",
      { r1, r2 }
    );
  } else {
    log(
      logUpdater,
      "VERIFICATION FAILURE: Data verification failed.",
      "error",
      { r1, r2 }
    );
  }
}

export async function runFailedTransaction_Db1First(logUpdater: LogUpdater) {
  if (!db1Instance || !db2Instance || !isAttached) {
    log(
      logUpdater,
      "Databases not initialized/attached. Run initialization first.",
      "error"
    );
    return;
  }
  log(
    logUpdater,
    "\n--- Testing Failed Transaction (DB1 write first, then error) ---"
  );

  const note1Id = `fail-note-db1-first-${Date.now()}`;
  const note1Content = "Should be rolled back from DB1";

  try {
    await db1Instance.transaction().execute(async (trx) => {
      await trx
        .insertInto("notes")
        .values({ id: note1Id, content: note1Content })
        .execute();
      log(logUpdater, "Inserted into db1.notes (should be rolled back).");
      throw new Error("Simulated error after DB1 insert");
    });
    log(
      logUpdater,
      "TRANSACTION FAILURE: Transaction should have failed.",
      "error"
    );
  } catch (error: any) {
    if (error.message === "Simulated error after DB1 insert") {
      log(
        logUpdater,
        `Transaction correctly rolled back due to: ${error.message}`,
        "success"
      );
    } else {
      log(
        logUpdater,
        `Transaction failed, but not with the expected error: ${error.message}`,
        "error",
        error
      );
    }
  }

  const r1 = await db1Instance
    .selectFrom("notes")
    .where("id", "=", note1Id)
    .selectAll()
    .executeTakeFirst();
  const r2CountResult = await db2Instance
    .selectFrom("notes")
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const r2Count = r2CountResult ? Number(r2CountResult.count) : -1;

  if (!r1 && r2Count === 0) {
    log(
      logUpdater,
      "VERIFICATION SUCCESS: DB1 rolled back, DB2 unaffected.",
      "success",
      { db1Record: r1, db2NoteCount: r2Count }
    );
  } else {
    log(logUpdater, "VERIFICATION FAILURE: Rollback check failed.", "error", {
      db1Record: r1,
      db2NoteCount: r2Count,
    });
  }
}

export async function runFailedTransaction_Db2First(logUpdater: LogUpdater) {
  if (!db1Instance || !db2Instance || !isAttached) {
    log(
      logUpdater,
      "Databases not initialized/attached. Run initialization first.",
      "error"
    );
    return;
  }
  log(
    logUpdater,
    "\n--- Testing Failed Transaction (DB2 write first, then error) ---"
  );

  const note2Id = `fail-note-db2-first-${Date.now()}`;
  const note2Content = "Should be rolled back from DB2";

  try {
    await db1Instance.transaction().execute(async (trx) => {
      await sql`INSERT INTO ${sql.table(
        ATTACHED_DB_ALIAS + ".notes"
      )} (id, content) VALUES (${note2Id}, ${note2Content})`.execute(trx);
      log(
        logUpdater,
        "Inserted into attached_db.notes (should be rolled back)."
      );
      throw new Error("Simulated error after DB2 insert");
    });
    log(
      logUpdater,
      "TRANSACTION FAILURE: Transaction should have failed.",
      "error"
    );
  } catch (error: any) {
    if (error.message === "Simulated error after DB2 insert") {
      log(
        logUpdater,
        `Transaction correctly rolled back due to: ${error.message}`,
        "success"
      );
    } else {
      log(
        logUpdater,
        `Transaction failed, but not with the expected error: ${error.message}`,
        "error",
        error
      );
    }
  }

  const r1CountResult = await db1Instance
    .selectFrom("notes")
    .select((eb) => eb.fn.countAll().as("count"))
    .executeTakeFirst();
  const r1Count = r1CountResult ? Number(r1CountResult.count) : -1;
  const r2 = await db2Instance
    .selectFrom("notes")
    .where("id", "=", note2Id)
    .selectAll()
    .executeTakeFirst();

  if (!r2 && r1Count === 0) {
    log(
      logUpdater,
      "VERIFICATION SUCCESS: DB2 rolled back, DB1 unaffected.",
      "success",
      { db1NoteCount: r1Count, db2Record: r2 }
    );
  } else {
    log(logUpdater, "VERIFICATION FAILURE: Rollback check failed.", "error", {
      db1NoteCount: r1Count,
      db2Record: r2,
    });
  }
}

export async function testSimpleDirectInserts(logUpdater: LogUpdater) {
  if (!db1Instance || !db2Instance || !isAttached) {
    log(
      logUpdater,
      "Databases not initialized/attached. Run initialization first.",
      "error"
    );
    return;
  }
  log(logUpdater, "\n--- Testing Simple Direct Inserts (No Transaction) ---");
  // Not clearing tables here to see if data accumulates or persists across calls

  const note1Id = `direct-insert-db1-${Date.now()}`;
  const note1Content = "Direct insert to DB1 (no transaction)";
  const note2Id = `direct-insert-db2-${Date.now()}`;
  const note2Content = "Direct insert to DB2 via attached (no transaction)";

  try {
    // Insert into db1
    await db1Instance
      .insertInto("notes")
      .values({ id: note1Id, content: note1Content })
      .execute();
    log(logUpdater, `Directly inserted into db1.notes: ${note1Id}`, "success");

    // Insert into db2 via attached alias
    await sql`INSERT INTO ${sql.table(
      ATTACHED_DB_ALIAS + ".notes"
    )} (id, content) VALUES (${note2Id}, ${note2Content})`.execute(db1Instance);
    log(
      logUpdater,
      `Directly inserted into ${ATTACHED_DB_ALIAS}.notes: ${note2Id}`,
      "success"
    );
  } catch (error: any) {
    log(
      logUpdater,
      `Error during simple direct inserts: ${error.message}`,
      "error",
      error
    );
    return;
  }

  // Verification (optional, but good for consistency in logs)
  const r1 = await db1Instance
    .selectFrom("notes")
    .where("id", "=", note1Id)
    .selectAll()
    .executeTakeFirst();
  const r2 = await db2Instance
    .selectFrom("notes")
    .where("id", "=", note2Id)
    .selectAll()
    .executeTakeFirst(); // Verify with direct db2 instance

  if (r1 && r1.content === note1Content && r2 && r2.content === note2Content) {
    log(
      logUpdater,
      "VERIFICATION SUCCESS (Direct Inserts): Data read back from both databases.",
      "success",
      { r1, r2 }
    );
  } else {
    log(
      logUpdater,
      "VERIFICATION FAILURE (Direct Inserts): Data read back mismatch or missing.",
      "error",
      { r1, r2 }
    );
  }
}
