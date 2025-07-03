import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely } from "kysely";

const DB_NAME = "concurrent-test-simple.sqlite3";

function log(message, transactionId = null, type = "info") {
  const timestamp = new Date().toISOString();
  const prefix = transactionId ? `[TX-${transactionId}]` : "[MAIN]";

  const logDiv = document.getElementById("log");

  const logLine = document.createElement("div");
  logLine.innerHTML = `<span class="timestamp">${timestamp}</span> <span class="${
    transactionId ? "tx-" + transactionId.toLowerCase() : "main"
  } ${type}">${prefix} ${message}</span>`;
  logDiv.appendChild(logLine);
  logDiv.scrollTop = logDiv.scrollHeight;

  console.log(`${timestamp} ${prefix} ${message}`);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDatabase() {
  log("Initializing database...", null, "info");

  try {
    const { dialect } = new SQLocalKysely(DB_NAME);
    const db = new Kysely({ dialect });

    // Drop and recreate table
    await db.schema.dropTable("test_table").ifExists().execute();
    await db.schema
      .createTable("test_table")
      .addColumn("id", "integer", (col) => col.primaryKey())
      .addColumn("value", "text")
      .addColumn("modified_by", "text")
      .addColumn("created_at", "text")
      .execute();

    log("Database initialized successfully", null, "success");
    return db;
  } catch (error) {
    log(`Database initialization failed: ${error.message}`, null, "error");
    throw error;
  }
}

async function runConcurrentTransactionTest() {
  log("Running concurrent transaction test...");

  const db = await initDatabase();

  log("Initializing transaction A...", "A");
  db.transaction()
    .execute(async (tx) => {
      log("Transaction A started", "A", "info");
      await tx
        .insertInto("test_table")
        .values({
          value: "A",
          modified_by: "A",
          created_at: new Date().toISOString(),
        })
        .execute();
    })
    .then(() => {
      log("Transaction A completed", "A", "success");
    })
    .catch((error) => {
      log(`Transaction A failed: ${error.message}`, "A", "error");
    });

  log("Initializing transaction B...", "B");
  db.transaction()
    .execute(async (tx) => {
      log("Transaction B started", "B", "info");
      await tx
        .insertInto("test_table")
        .values({
          value: "B",
          modified_by: "B",
          created_at: new Date().toISOString(),
        })
        .execute();
    })
    .then(() => {
      log("Transaction B completed", "B", "success");
    })
    .catch((error) => {
      log(`Transaction B failed: ${error.message}`, "B", "error");
    });

  log("Initializing transaction C...", "C");
  db.transaction()
    .execute(async (tx) => {
      log("Transaction C started", "C", "info");
      const all = await tx.selectFrom("test_table").selectAll().execute();
      log(`Transaction C completed: ${all.length} rows`, "C", "success");
    })
    .catch((error) => {
      log(`Transaction C failed: ${error.message}`, "C", "error");
    });

  log("Concurrent transaction test completed", null, "success");
}

// Make functions available globally
window.runTest = runConcurrentTransactionTest;
window.clearLog = () => {
  document.getElementById("log").innerHTML = "";
};
