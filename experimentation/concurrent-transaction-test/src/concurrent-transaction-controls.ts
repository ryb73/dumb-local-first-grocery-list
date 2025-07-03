import { Kysely, sql, ColumnDefinitionBuilder, Transaction } from "kysely";
import { SQLocalKysely } from "sqlocal/kysely";

export type LogEntry = {
  message: string;
  type: "info" | "success" | "error" | "warn" | "step";
  data?: any;
  timestamp: number;
};

export type LogUpdater = (entry: LogEntry | string) => void;

export type TransactionState = {
  id: "A" | "B";
  instance: Transaction<TestSchema> | null;
  active: boolean;
  committed: boolean;
  rolledBack: boolean;
};

export type ConcurrentTransactionState = {
  transactionA: TransactionState;
  transactionB: TransactionState;
  dbInitialized: boolean;
};

interface PlaylistTable {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration_seconds: number;
  created_at: string;
}

interface TestSchema {
  playlist: PlaylistTable;
}

const DB_NAME = "concurrent-test.sqlite3";
let dbInstance: Kysely<TestSchema> | null = null;
let transactionState: ConcurrentTransactionState = {
  transactionA: {
    id: "A",
    instance: null,
    active: false,
    committed: false,
    rolledBack: false,
  },
  transactionB: {
    id: "B",
    instance: null,
    active: false,
    committed: false,
    rolledBack: false,
  },
  dbInitialized: false,
};

function log(
  updater: LogUpdater,
  message: string,
  type: LogEntry["type"] = "info",
  data?: any
) {
  updater({ message, type, data, timestamp: Date.now() });
}

function logStep(
  updater: LogUpdater,
  stepName: string,
  transactionId: "A" | "B",
  data?: any
) {
  log(updater, `[Transaction ${transactionId}] ${stepName}`, "step", data);
}

export async function initializeDatabase(logUpdater: LogUpdater): Promise<boolean> {
  try {
    log(logUpdater, `Initializing database: ${DB_NAME}...`);
    
    const { dialect } = new SQLocalKysely(DB_NAME);
    dbInstance = new Kysely<TestSchema>({ dialect });
    
    await dbInstance.schema.dropTable("playlist").ifExists().execute();
    await dbInstance.schema
      .createTable("playlist")
      .addColumn("id", "text", (col: ColumnDefinitionBuilder) => col.primaryKey())
      .addColumn("title", "text", (col: ColumnDefinitionBuilder) => col.notNull())
      .addColumn("artist", "text", (col: ColumnDefinitionBuilder) => col.notNull())
      .addColumn("album", "text", (col: ColumnDefinitionBuilder) => col.notNull())
      .addColumn("duration_seconds", "integer", (col: ColumnDefinitionBuilder) => col.notNull())
      .addColumn("created_at", "text", (col: ColumnDefinitionBuilder) => col.notNull())
      .execute();
    
    log(logUpdater, "Database initialized with playlist table", "success");
    transactionState.dbInitialized = true;
    return true;
  } catch (error: any) {
    log(logUpdater, `Database initialization failed: ${error.message}`, "error", error);
    return false;
  }
}

export async function startTransaction(transactionId: "A" | "B", logUpdater: LogUpdater): Promise<boolean> {
  if (!dbInstance) {
    log(logUpdater, "Database not initialized", "error");
    return false;
  }

  const txState = transactionId === "A" ? transactionState.transactionA : transactionState.transactionB;
  
  if (txState.active) {
    log(logUpdater, `Transaction ${transactionId} is already active`, "warn");
    return false;
  }

  try {
    logStep(logUpdater, "Starting transaction", transactionId);
    
    // Start a long-running transaction
    const txPromise = dbInstance.transaction().execute(async (trx) => {
      txState.instance = trx;
      txState.active = true;
      txState.committed = false;
      txState.rolledBack = false;
      
      logStep(logUpdater, "Transaction started and waiting for commands", transactionId);
      
      // Keep the transaction open until commit or rollback
      return new Promise<void>((resolve, reject) => {
        const checkStatus = () => {
          if (txState.committed) {
            logStep(logUpdater, "Transaction committing", transactionId);
            resolve();
          } else if (txState.rolledBack) {
            logStep(logUpdater, "Transaction rolling back", transactionId);
            reject(new Error(`Transaction ${transactionId} rolled back`));
          } else {
            setTimeout(checkStatus, 100);
          }
        };
        checkStatus();
      });
    });
    
    // Handle transaction completion
    txPromise.then(() => {
      txState.active = false;
      txState.instance = null;
      logStep(logUpdater, "Transaction completed", transactionId);
    }).catch((error) => {
      txState.active = false;
      txState.instance = null;
      logStep(logUpdater, `Transaction failed: ${error.message}`, transactionId);
    });
    
    // Wait a moment for the transaction to be set up
    await new Promise(resolve => setTimeout(resolve, 50));
    
    return true;
  } catch (error: any) {
    log(logUpdater, `Failed to start transaction ${transactionId}: ${error.message}`, "error", error);
    return false;
  }
}

export async function executeSQL(
  transactionId: "A" | "B" | "direct",
  sqlCommand: string,
  logUpdater: LogUpdater
): Promise<boolean> {
  if (!dbInstance) {
    log(logUpdater, "Database not initialized", "error");
    return false;
  }

  try {
    let result: any;
    
    if (transactionId === "direct") {
      log(logUpdater, `Executing SQL directly: ${sqlCommand}`, "step");
      result = await sql.raw(sqlCommand).execute(dbInstance);
    } else {
      const txState = transactionId === "A" ? transactionState.transactionA : transactionState.transactionB;
      
      if (!txState.active || !txState.instance) {
        log(logUpdater, `Transaction ${transactionId} is not active`, "error");
        return false;
      }
      
      logStep(logUpdater, `Executing SQL: ${sqlCommand}`, transactionId);
      result = await sql.raw(sqlCommand).execute(txState.instance);
    }
    
    const logTarget = transactionId === "direct" ? "Direct execution" : `Transaction ${transactionId}`;
    log(logUpdater, `${logTarget} - SQL executed successfully`, "success", { 
      sql: sqlCommand, 
      result: result?.length ? result : "No result data" 
    });
    
    return true;
  } catch (error: any) {
    const logTarget = transactionId === "direct" ? "Direct execution" : `Transaction ${transactionId}`;
    log(logUpdater, `${logTarget} - SQL execution failed: ${error.message}`, "error", { 
      sql: sqlCommand, 
      error: error.message 
    });
    return false;
  }
}

export async function commitTransaction(transactionId: "A" | "B", logUpdater: LogUpdater): Promise<boolean> {
  const txState = transactionId === "A" ? transactionState.transactionA : transactionState.transactionB;
  
  if (!txState.active) {
    log(logUpdater, `Transaction ${transactionId} is not active`, "error");
    return false;
  }
  
  try {
    logStep(logUpdater, "Committing transaction", transactionId);
    txState.committed = true;
    
    setTimeout(() => {
      logStep(logUpdater, "Transaction committed successfully", transactionId);
      txState.active = false;
      txState.instance = null;
    }, 200);
    
    return true;
  } catch (error: any) {
    log(logUpdater, `Failed to commit transaction ${transactionId}: ${error.message}`, "error", error);
    return false;
  }
}

export async function rollbackTransaction(transactionId: "A" | "B", logUpdater: LogUpdater): Promise<boolean> {
  const txState = transactionId === "A" ? transactionState.transactionA : transactionState.transactionB;
  
  if (!txState.active) {
    log(logUpdater, `Transaction ${transactionId} is not active`, "error");
    return false;
  }
  
  try {
    logStep(logUpdater, "Rolling back transaction", transactionId);
    txState.rolledBack = true;
    
    setTimeout(() => {
      logStep(logUpdater, "Transaction rolled back successfully", transactionId);
      txState.active = false;
      txState.instance = null;
    }, 200);
    
    return true;
  } catch (error: any) {
    log(logUpdater, `Failed to rollback transaction ${transactionId}: ${error.message}`, "error", error);
    return false;
  }
}

export async function queryCurrentState(logUpdater: LogUpdater): Promise<void> {
  if (!dbInstance) {
    log(logUpdater, "Database not initialized", "error");
    return;
  }
  
  try {
    log(logUpdater, "Querying current database state...");
    
    const records = await dbInstance
      .selectFrom("playlist")
      .selectAll()
      .orderBy("created_at", "asc")
      .execute();
    
    log(logUpdater, `Found ${records.length} songs in playlist`, "info", { records });
  } catch (error: any) {
    log(logUpdater, `Failed to query database: ${error.message}`, "error", error);
  }
}

export async function clearDatabase(logUpdater: LogUpdater): Promise<boolean> {
  if (!dbInstance) {
    log(logUpdater, "Database not initialized", "error");
    return false;
  }
  
  try {
    log(logUpdater, "Clearing playlist...");
    await dbInstance.deleteFrom("playlist").execute();
    log(logUpdater, "Playlist cleared successfully", "success");
    return true;
  } catch (error: any) {
    log(logUpdater, `Failed to clear playlist: ${error.message}`, "error", error);
    return false;
  }
}

export function getTransactionState(): ConcurrentTransactionState {
  return { ...transactionState };
}

export function resetTransactionState(): void {
  transactionState = {
    transactionA: {
      id: "A",
      instance: null,
      active: false,
      committed: false,
      rolledBack: false,
    },
    transactionB: {
      id: "B",
      instance: null,
      active: false,
      committed: false,
      rolledBack: false,
    },
    dbInitialized: false,
  };
}