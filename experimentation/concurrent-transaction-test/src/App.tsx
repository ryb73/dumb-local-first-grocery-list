import { createSignal, For, Show } from "solid-js";
import styles from "./App.module.css";
import {
  initializeDatabase,
  startTransaction,
  executeSQL,
  commitTransaction,
  rollbackTransaction,
  queryCurrentState,
  clearDatabase,
  getTransactionState,
  resetTransactionState,
  type LogEntry,
  type LogUpdater,
} from "./concurrent-transaction-controls";

function App() {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [isDbInitialized, setIsDbInitialized] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [sqlCommand, setSqlCommand] = createSignal("");
  const [selectedContext, setSelectedContext] = createSignal<"A" | "B" | "direct">("direct");

  const addLog: LogUpdater = (entryOrMessage) => {
    const entry =
      typeof entryOrMessage === "string"
        ? { message: entryOrMessage, type: "info" as const, timestamp: Date.now() }
        : entryOrMessage;
    setLogs((prevLogs) => [entry, ...prevLogs]);
    
    // Update transaction status whenever we log something
    updateTransactionStatus();
    
    const logsDiv = document.querySelector(`.${styles.logs}`);
    if (logsDiv) {
      setTimeout(() => (logsDiv.scrollTop = 0), 0);
    }
  };

  const handleAction = async (action: () => Promise<any>) => {
    setIsProcessing(true);
    try {
      await action();
    } catch (e: any) {
      addLog({
        message: `Unhandled action error: ${e.message}`,
        type: "error",
        data: e,
        timestamp: Date.now(),
      });
    }
    setIsProcessing(false);
  };

  const onInitializeDb = async () => {
    const success = await initializeDatabase(addLog);
    setIsDbInitialized(success);
  };

  const onStartTransaction = (transactionId: "A" | "B") => async () => {
    await startTransaction(transactionId, addLog);
  };

  const onExecuteSQL = async () => {
    const sql = sqlCommand().trim();
    if (!sql) {
      addLog({ message: "Please enter a SQL command", type: "warn", timestamp: Date.now() });
      return;
    }
    await executeSQL(selectedContext(), sql, addLog);
  };

  const onCommitTransaction = (transactionId: "A" | "B") => async () => {
    await commitTransaction(transactionId, addLog);
  };

  const onRollbackTransaction = (transactionId: "A" | "B") => async () => {
    await rollbackTransaction(transactionId, addLog);
  };

  const onQueryState = () => queryCurrentState(addLog);
  const onClearDb = () => clearDatabase(addLog);
  
  const onReset = async () => {
    resetTransactionState();
    setIsDbInitialized(false);
    setLogs([]);
    updateTransactionStatus();
    addLog({ message: "Application reset", type: "info", timestamp: Date.now() });
  };

  const [transactionStatus, setTransactionStatus] = createSignal({
    txA: "Inactive",
    txB: "Inactive",
  });

  const updateTransactionStatus = () => {
    const state = getTransactionState();
    setTransactionStatus({
      txA: state.transactionA.active ? "Active" : "Inactive",
      txB: state.transactionB.active ? "Active" : "Inactive",
    });
  };

  return (
    <div class={styles.container}>
      <h1>Concurrent SQLite Transaction Testing</h1>
      
      <div class={styles.status}>
        <span class={`${styles.statusBadge} ${transactionStatus().txA === "Active" ? styles.active : styles.inactive}`}>
          Transaction A: {transactionStatus().txA}
        </span>
        <span class={`${styles.statusBadge} ${transactionStatus().txB === "Active" ? styles.active : styles.inactive}`}>
          Transaction B: {transactionStatus().txB}
        </span>
      </div>

      <div class={styles.controls}>
        <div class={styles.section}>
          <h3>Database Setup</h3>
          <button
            onClick={() => handleAction(onInitializeDb)}
            disabled={isProcessing() || isDbInitialized()}
          >
            Initialize Database
          </button>
          <button
            onClick={() => handleAction(onReset)}
            disabled={isProcessing()}
          >
            Reset All
          </button>
        </div>

        <div class={styles.section}>
          <h3>Transaction Control</h3>
          <div class={styles.buttonGroup}>
            <button
              onClick={() => handleAction(onStartTransaction("A"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Start Transaction A
            </button>
            <button
              onClick={() => handleAction(onStartTransaction("B"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Start Transaction B
            </button>
          </div>
          <div class={styles.buttonGroup}>
            <button
              onClick={() => handleAction(onCommitTransaction("A"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Commit Transaction A
            </button>
            <button
              onClick={() => handleAction(onCommitTransaction("B"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Commit Transaction B
            </button>
          </div>
          <div class={styles.buttonGroup}>
            <button
              onClick={() => handleAction(onRollbackTransaction("A"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Rollback Transaction A
            </button>
            <button
              onClick={() => handleAction(onRollbackTransaction("B"))}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Rollback Transaction B
            </button>
          </div>
        </div>

        <div class={styles.section}>
          <h3>SQL Execution</h3>
          <div class={styles.sqlInput}>
            <select 
              value={selectedContext()} 
              onInput={(e) => setSelectedContext(e.target.value as "A" | "B" | "direct")}
            >
              <option value="direct">Direct (Outside Transaction)</option>
              <option value="A">Transaction A</option>
              <option value="B">Transaction B</option>
            </select>
            <textarea
              value={sqlCommand()}
              onInput={(e) => setSqlCommand(e.target.value)}
              placeholder="Enter SQL command (e.g., INSERT INTO playlist (id, title, artist, album, duration_seconds, created_at) VALUES ('1', 'Song Title', 'Artist', 'Album', 180, datetime('now')))"
              rows={3}
            />
            <button
              onClick={() => handleAction(onExecuteSQL)}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Execute SQL
            </button>
          </div>
        </div>

        <div class={styles.section}>
          <h3>Database Query</h3>
          <div class={styles.buttonGroup}>
            <button
              onClick={() => handleAction(onQueryState)}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Query Current State
            </button>
            <button
              onClick={() => handleAction(onClearDb)}
              disabled={isProcessing() || !isDbInitialized()}
            >
              Clear Database
            </button>
          </div>
        </div>
      </div>

      <div class={styles.quickExamples}>
        <h3>Quick Examples</h3>
        <div class={styles.exampleButtons}>
          <button
            onClick={() => setSqlCommand("INSERT INTO playlist (id, title, artist, album, duration_seconds, created_at) VALUES ('song1', 'Bohemian Rhapsody', 'Queen', 'A Night at the Opera', 355, datetime('now'))")}
            disabled={isProcessing()}
          >
            Insert Song
          </button>
          <button
            onClick={() => setSqlCommand("SELECT * FROM playlist")}
            disabled={isProcessing()}
          >
            Select All
          </button>
          <button
            onClick={() => setSqlCommand("UPDATE playlist SET title = 'Updated Title' WHERE id = 'song1'")}
            disabled={isProcessing()}
          >
            Update Song
          </button>
          <button
            onClick={() => setSqlCommand("DELETE FROM playlist WHERE id = 'song1'")}
            disabled={isProcessing()}
          >
            Delete Song
          </button>
        </div>
      </div>

      <Show when={logs().length > 0}>
        <div class={styles.logs}>
          <h3>Execution Log</h3>
          <For each={logs()}>
            {(log) => (
              <div class={`${styles.logEntry} ${styles[log.type]}`}>
                <span class={styles.timestamp}>
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <span class={styles.message}>{log.message}</span>
                <Show when={log.data}>
                  <pre class={styles.logData}>{JSON.stringify(log.data, null, 2)}</pre>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      
      <Show when={logs().length === 0}>
        <p>No logs yet. Initialize the database to start testing.</p>
      </Show>
    </div>
  );
}

export default App;