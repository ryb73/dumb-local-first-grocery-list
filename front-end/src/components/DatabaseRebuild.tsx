import { applyOperationMergedDB , initMergedDatabase , operationSchema } from "@grocery-list/shared";
import type { Component } from "solid-js";
import { For, createSignal } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import styles from "./DatabaseRebuild.module.css";

type DatabaseOption = `both` | `client` | `server`;

export const DatabaseRebuild: Component = () => {
  const [isRebuilding, setIsRebuilding] = createSignal(false);
  const [logs, setLogs] = createSignal<string[]>([]);
  const [error, setError] = createSignal<string | null>(null);
  const [selectedDatabase, setSelectedDatabase] =
    createSignal<DatabaseOption>(`client`);

  /**
   * Adds a log message to the display
   */
  const addLog = (message: string) => {
    setLogs((prev) => [
      ...prev,
      `${new Date().toLocaleTimeString()}: ${message}`,
    ]);
  };

  /**
   * Rebuilds a database from its operation log
   */
  const rebuildDatabase = async (
    mainDbName: string,
    operationLogDbName: string,
    displayName: string
  ) => {
    addLog(`Starting rebuild for ${displayName}...`);

    // Initialize the merged database
    const mergedDb = await initMergedDatabase(
      operationLogDbName,
      new SQLocalKysely(mainDbName).dialect,
      new SQLocalKysely(operationLogDbName).dialect
    );

    try {
      // Wrap the entire rebuild process in a transaction
      await mergedDb.transaction().execute(async (trx) => {
        // Clear the main database
        addLog(`Clearing main database tables for ${displayName}...`);
        await trx.deleteFrom(`items`).execute();
        addLog(`Cleared items table for ${displayName}`);

        // Fetch all operations from the operation log, ordered by client_created_at
        addLog(`Fetching operations from operation log for ${displayName}...`);
        const operationRows = await trx
          .selectFrom(`op_log.operations`)
          .selectAll()
          .orderBy(`client_created_at`, `asc`)
          .execute();

        addLog(
          `Found ${operationRows.length} operations to replay for ${displayName}`
        );

        // Parse and apply each operation in sequence
        let appliedCount = 0;
        for (const row of operationRows) {
          // Parse the operation
          const operation = operationSchema.parse({
            clientCreatedAt: row.client_created_at,
            id: row.id,
            payload: JSON.parse(row.payload),
            serverCommittedAt: row.server_committed_at,
            type: row.type,
          });

          // Apply the operation to the main database within the transaction
          await applyOperationMergedDB(trx, operation);
          appliedCount++;

          addLog(
            `Applied ${appliedCount}/${operationRows.length} operations for ${displayName}`
          );
        }

        addLog(
          `✅ Successfully rebuilt ${displayName}: applied ${appliedCount} operations`
        );
      });
    } finally {
      // Close the database connection
      await mergedDb.destroy();
    }
  };

  /**
   * Rebuilds selected databases from their operation logs
   */
  const handleRebuild = async () => {
    if (isRebuilding()) return;

    setIsRebuilding(true);
    setLogs([]);
    setError(null);

    try {
      const selected = selectedDatabase();
      addLog(
        `🔧 Starting database rebuild from operation logs (${selected})...`
      );

      if (selected === `client` || selected === `both`) {
        // Rebuild client database (Database 1)
        await rebuildDatabase(
          `grocery-list.sqlite3`,
          `grocery-list.log.sqlite3`,
          `Client Database`
        );
      }

      if (selected === `server` || selected === `both`) {
        // Rebuild server database (Database 2)
        await rebuildDatabase(
          `grocery-list-2.sqlite3`,
          `grocery-list-2.log.sqlite3`,
          `Server Database`
        );
      }

      addLog(`🎉 Selected database(s) rebuilt successfully!`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      addLog(`❌ Rebuild failed: ${errorMessage}`);
    } finally {
      setIsRebuilding(false);
    }
  };

  /**
   * Clears the log display
   */
  const clearLogs = () => {
    setLogs([]);
    setError(null);
  };

  return (
    <div class={styles[`container`]}>
      <div class={styles[`header`]}>
        <h1>Database Rebuild Utility</h1>
        <p class={styles[`description`]}>
          This utility rebuilds the main database state from the operation log.
          It clears all data in the main database tables and replays all
          operations from the operation log in chronological order.
        </p>
      </div>

      <div class={styles[`controls`]}>
        <div class={styles[`selector`]}>
          <label class={styles[`selectorLabel`]} for="database-select">
            Database to rebuild:
          </label>
          <select
            class={styles[`selectorDropdown`]}
            disabled={isRebuilding()}
            id="database-select"
            onChange={(e) =>
              setSelectedDatabase(e.target.value as DatabaseOption)
            }
            value={selectedDatabase()}
          >
            <option value="both">Both Databases</option>
            <option value="client">Client Database Only</option>
            <option value="server">Server Database Only</option>
          </select>
        </div>

        <div class={styles[`actions`]}>
          <button
            class={styles[`rebuildButton`]}
            disabled={isRebuilding()}
            onClick={() => void handleRebuild()}
            type="button"
          >
            {isRebuilding() ? `Rebuilding...` : `🔧 Rebuild Databases`}
          </button>

          <button
            class={styles[`clearButton`]}
            disabled={isRebuilding()}
            onClick={clearLogs}
            type="button"
          >
            Clear Logs
          </button>
        </div>
      </div>

      {error() != null && (
        <div class={styles[`error`]}>
          <strong>Error:</strong> {error()}
        </div>
      )}

      <div class={styles[`logsContainer`]}>
        <h2>Rebuild Log</h2>
        <div class={styles[`logs`]}>
          {logs().length === 0 ? (
            <div class={styles[`emptyState`]}>
              No rebuild operations yet. Click &ldquo;Rebuild Databases&rdquo;
              to start.
            </div>
          ) : (
            <For each={logs()}>
              {(log) => <div class={styles[`logEntry`]}>{log}</div>}
            </For>
          )}
        </div>
      </div>

      <div class={styles[`warning`]}>
        <h3>⚠️ Warning</h3>
        <p>
          This operation will completely clear all data in the main database
          tables and rebuild them from the operation log. Make sure you have
          backups if needed. The operation log itself will not be modified.
        </p>
      </div>
    </div>
  );
};
