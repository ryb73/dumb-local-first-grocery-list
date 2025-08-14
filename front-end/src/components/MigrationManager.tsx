import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import {
  Kysely,
  type MigrationInfo,
  type MigrationResultSet,
  type Migrator,
} from "kysely";
import type { Component } from "solid-js";
import { createSignal, onMount } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import type { DB } from "../../db";
import type { DB as OperationLogDB } from "../../operation-log-db";
import { createMigrator } from "../db/migrations/createMigrator";
import { createOperationLogMigrator } from "../db/operation-log/migrations/createOperationLogMigrator";
import styles from "./MigrationManager.module.css";

type MigrationStatus = {
  executedAt: Date | undefined;
  name: string;
};

type DatabaseMigrationInfo = {
  isOperationLog: boolean;
  kysely: Kysely<DB> | Kysely<OperationLogDB>;
  migrator: Migrator;
  migrations: MigrationStatus[];
  name: string;
};

/**
 * Get migration status for a specific migrator
 */
const getMigrationStatus = async (
  migrator: Migrator,
  isOperationLog: boolean
): Promise<MigrationStatus[]> => {
  try {
    const migrationInfos: readonly MigrationInfo[] =
      await migrator.getMigrations();

    return migrationInfos.map((info) => ({
      name: info.name,
      executedAt: info.executedAt,
    }));
  } catch (err) {
    console.error(
      `Failed to get migration status for ${
        isOperationLog ? `operation log` : `main`
      } database:`,
      err
    );
    return [];
  }
};

/**
 * Migration Manager component that provides a UI for viewing and controlling
 * database migrations across multiple database instances.
 */
export const MigrationManager: Component = () => {
  const [databases, setDatabases] = createSignal<DatabaseMigrationInfo[]>([]);
  const [isLoading, setIsLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);

  /**
   * Initialize database connections and migration status
   */
  const initializeDatabases = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const mainKysely1 = new Kysely<DB>({
        dialect: new SQLocalKysely(`grocery-list.sqlite3`).dialect,
      });
      const mainKysely2 = new Kysely<DB>({
        dialect: new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
      });

      const opLogKysely1 = new Kysely<OperationLogDB>({
        dialect: new SQLocalKysely(`grocery-list.log.sqlite3`).dialect,
      });
      const opLogKysely2 = new Kysely<OperationLogDB>({
        dialect: new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect,
      });

      // Create migrators for main databases
      const migrator1 = createMigrator(mainKysely1, false);
      const migrator2 = createMigrator(mainKysely2, false);

      // Create migrators for operation log databases
      const opLogMigrator1 = createOperationLogMigrator(opLogKysely1, false);
      const opLogMigrator2 = createOperationLogMigrator(opLogKysely2, false);

      // Get migration status for all databases
      const db1Migrations = await getMigrationStatus(migrator1, false);
      const db2Migrations = await getMigrationStatus(migrator2, false);
      const opLog1Migrations = await getMigrationStatus(opLogMigrator1, true);
      const opLog2Migrations = await getMigrationStatus(opLogMigrator2, true);

      setDatabases([
        {
          isOperationLog: false,
          kysely: mainKysely1,
          migrations: db1Migrations,
          migrator: migrator1,
          name: `Database 1 (Main)`,
        },
        {
          isOperationLog: true,
          kysely: opLogKysely1,
          migrations: opLog1Migrations,
          migrator: opLogMigrator1,
          name: `Database 1 (Operation Log)`,
        },
        {
          isOperationLog: false,
          kysely: mainKysely2,
          migrations: db2Migrations,
          migrator: migrator2,
          name: `Database 2 (Main)`,
        },
        {
          isOperationLog: true,
          kysely: opLogKysely2,
          migrations: opLog2Migrations,
          migrator: opLogMigrator2,
          name: `Database 2 (Operation Log)`,
        },
      ]);
    } catch (err) {
      console.error(`Failed to initialize databases:`, err);
      setError(`Failed to initialize databases: ${String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Migrate a specific database up (forward) to the latest
   */
  const migrateUp = async (dbIndex: number) => {
    try {
      const db = databases()[dbIndex];
      if (db == null) return;

      setError(null);
      const result: MigrationResultSet = await db.migrator.migrateUp();

      if (result.error != null) {
        setError(`Migration failed: ${String(result.error)}`);
      } else {
        // Refresh migration status
        const updatedMigrations = await getMigrationStatus(
          db.migrator,
          db.isOperationLog
        );

        setDatabases((prev) =>
          prev.map((database, index) =>
            index === dbIndex
              ? { ...database, migrations: updatedMigrations }
              : database
          )
        );
      }
    } catch (err) {
      setError(`Migration failed: ${String(err)}`);
    }
  };

  /**
   * Migrate a specific database down (backward) by one step
   */
  const migrateDown = async (dbIndex: number) => {
    try {
      const db = defined(databases()[dbIndex]);

      setError(null);
      const result: MigrationResultSet = await db.migrator.migrateDown();

      if (result.error != null) {
        setError(`Migration rollback failed: ${String(result.error)}`);
      } else {
        // Refresh migration status
        const updatedMigrations = await getMigrationStatus(
          db.migrator,
          db.isOperationLog
        );

        setDatabases((prev) =>
          prev.map((database, index) =>
            index === dbIndex
              ? { ...database, migrations: updatedMigrations }
              : database
          )
        );
      }
    } catch (err) {
      setError(`Migration rollback failed: ${String(err)}`);
    }
  };

  /**
   * Refresh migration status for all databases
   */
  const refreshStatus = async () => {
    await initializeDatabases();
  };

  onMount(() => {
    void initializeDatabases();
  });

  return (
    <div class={defined(styles[`container`])}>
      <div class={defined(styles[`header`])}>
        <h1>Migration Manager</h1>
        <button
          class={defined(styles[`refreshButton`])}
          disabled={isLoading()}
          onClick={() => void refreshStatus()}
          type="button"
        >
          Refresh Status
        </button>
      </div>

      {error() != null && (
        <div class={defined(styles[`error`])}>
          <strong>Error:</strong> {error()}
        </div>
      )}

      {isLoading() ? (
        <div class={defined(styles[`loading`])}>Loading databases...</div>
      ) : (
        <div class={defined(styles[`databaseGrid`])}>
          {databases().map((db, dbIndex) => (
            <div class={defined(styles[`databaseCard`])}>
              <div class={defined(styles[`databaseHeader`])}>
                <h2>{db.name}</h2>
                <div class={defined(styles[`databaseActions`])}>
                  <button
                    class={defined(styles[`migrateButton`])}
                    onClick={() => void migrateUp(dbIndex)}
                    title="Migrate to latest"
                    type="button"
                  >
                    ↑ Up
                  </button>
                  <button
                    class={defined(styles[`migrateButton`])}
                    onClick={() => void migrateDown(dbIndex)}
                    title="Rollback one migration"
                    type="button"
                  >
                    ↓ Down
                  </button>
                </div>
              </div>

              <div class={defined(styles[`migrationsList`])}>
                {db.migrations.length === 0 ? (
                  <div class={defined(styles[`noMigrations`])}>
                    No migrations found
                  </div>
                ) : (
                  db.migrations.map((migration) => (
                    <div
                      class={`${defined(styles[`migrationItem`])} ${
                        migration.executedAt !== undefined
                          ? defined(styles[`executed`])
                          : defined(styles[`pending`])
                      }`}
                    >
                      <div class={defined(styles[`migrationName`])}>
                        {migration.name}
                      </div>
                      <div class={defined(styles[`migrationStatus`])}>
                        {migration.executedAt !== undefined ? (
                          <span class={defined(styles[`executedStatus`])}>
                            ✓ Executed at{` `}
                            {migration.executedAt.toLocaleString()}
                          </span>
                        ) : (
                          <span class={defined(styles[`pendingStatus`])}>
                            ⏳ Pending
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
