import { createSignal, For, Show } from "solid-js";
import styles from "./App.module.css";
import {
  initAndAttachDbs,
  detachDbs,
  clearAllTables,
  runSuccessfulTransaction,
  runFailedTransaction_Db1First,
  runFailedTransaction_Db2First,
  testSimpleDirectInserts,
  type LogEntry,
  type LogUpdater,
} from "./db-test-controls";

function App() {
  const [logs, setLogs] = createSignal<LogEntry[]>([]);
  const [isDbAttached, setIsDbAttached] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);

  const addLog: LogUpdater = (entryOrMessage) => {
    const entry =
      typeof entryOrMessage === "string"
        ? { message: entryOrMessage, type: "info" as const }
        : entryOrMessage;
    setLogs((prevLogs) => [entry, ...prevLogs]); // Add new logs to the top
    // Basic auto-scroll attempt (might need refinement for perfect scroll-to-bottom)
    const logsDiv = document.querySelector(`.${styles.logs}`);
    if (logsDiv) {
      setTimeout(() => (logsDiv.scrollTop = 0), 0); // Scroll to top for new messages
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
      });
    }
    setIsProcessing(false);
  };

  const onInitAndAttach = async () => {
    const success = await initAndAttachDbs(addLog);
    setIsDbAttached(success);
  };

  const onDetach = async () => {
    const success = await detachDbs(addLog);
    if (success || !isDbAttached()) {
      // if detach was successful OR it wasn't attached anyway
      setIsDbAttached(false);
    }
  };

  const onClearTables = () => clearAllTables(addLog);
  const onSuccessTx = () => runSuccessfulTransaction(addLog);
  const onFailDb1First = () => runFailedTransaction_Db1First(addLog);
  const onFailDb2First = () => runFailedTransaction_Db2First(addLog);
  const onSimpleInserts = () => testSimpleDirectInserts(addLog);

  return (
    <div class={styles.container}>
      <h1>Multi-DB Atomic Transaction Test UI</h1>
      <div class={styles.controls}>
        <button
          onClick={() => handleAction(onInitAndAttach)}
          disabled={isProcessing() || isDbAttached()}
        >
          1. Initialize & Attach DBs
        </button>
        <button
          onClick={() => handleAction(onSuccessTx)}
          disabled={isProcessing() || !isDbAttached()}
        >
          2. Test Successful Transaction
        </button>
        <button
          onClick={() => handleAction(onFailDb1First)}
          disabled={isProcessing() || !isDbAttached()}
        >
          3. Test Fail (DB1 Write First)
        </button>
        <button
          onClick={() => handleAction(onFailDb2First)}
          disabled={isProcessing() || !isDbAttached()}
        >
          4. Test Fail (DB2 Write First)
        </button>
        <button
          onClick={() => handleAction(onSimpleInserts)}
          disabled={isProcessing() || !isDbAttached()}
        >
          5. Test Simple Direct Inserts
        </button>
        <button
          onClick={() => handleAction(onClearTables)}
          disabled={isProcessing() || !isDbAttached()}
        >
          Clear Tables
        </button>
        <button
          onClick={() => handleAction(onDetach)}
          disabled={isProcessing() || !isDbAttached()}
        >
          Detach Databases
        </button>
      </div>

      <Show when={logs().length > 0}>
        <div class={styles.logs}>
          <For each={logs()}>
            {(log) => (
              <div class={`${styles.logEntry} ${styles[log.type]}`}>
                <span>{log.message}</span>
                <Show when={log.data}>
                  <pre>{JSON.stringify(log.data, null, 2)}</pre>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={logs().length === 0}>
        <p>No logs yet. Click a button to start.</p>
      </Show>
    </div>
  );
}

export default App;
