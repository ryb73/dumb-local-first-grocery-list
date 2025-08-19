import {
  defined,
  isDefined,
} from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { Index, createSignal, onMount } from "solid-js";
import type { Database } from "../db/database";
import { applyOperationMergedDB } from "../operation-logging/apply-operation";
import {
  checkMigrationCompatibility,
  rebaseLocalOperations,
  requestChangesFromServer,
  unwindLocalChanges,
} from "../sync";
import type { Item } from "../types/schemas";
import { AddItemForm } from "./AddItemForm";
import { GroceryItem } from "./GroceryItem";
import styles from "./GroceryList.module.css";
import { SyncButton, type SyncStatus } from "./SyncButton";

type GroceryListProps = {
  className?: string;
  db: Database;
  title: string;
  showSyncButton?: boolean;
};

export const GroceryList: Component<GroceryListProps> = (props) => {
  const [items, setItems] = createSignal<Item[]>([]);
  const [suggestions, setSuggestions] = createSignal<string[]>([]);
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus>({
    type: `idle`,
  });

  const sortedItems = () =>
    Array.from(items()).sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked === 0 ? -1 : 1;
    });

  const refreshData = async () => {
    setItems(await props.db.getItems());
    setSuggestions(await props.db.getSuggestions());
  };

  const handleAdd = async (name: string) => {
    await props.db.addItem(name);
    await refreshData();
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await props.db.toggleItem(id, checked);
    await refreshData();
  };

  const handleEdit = async (id: string, newName: string) => {
    await props.db.updateItem(id, { name: newName });
    await refreshData();
  };

  const handleSync = async () => {
    if (syncStatus().type === `syncing`) return;

    setSyncStatus({ type: `syncing` });

    try {
      // Step 0: Migration compatibility check
      const compatibilityResult = await checkMigrationCompatibility(
        props.db.getKyselyInstance()
      );

      if (!compatibilityResult.compatible) {
        setSyncStatus({
          type: `failure`,
          message:
            compatibilityResult.errorMessage ??
            `Migration compatibility check failed`,
        });
        return;
      }

      // Step 1: Client requests changes from the server
      console.log(`Step 1: Requesting changes from server...`);
      const remoteOps = await requestChangesFromServer(
        props.db.getKyselyInstance()
      );

      console.log(`Received ${remoteOps.length} remote operations from server`);
      console.log(`Remote operations:`, remoteOps);

      // Steps 2-4: Execute within a single transaction for atomicity
      await props.db
        .getKyselyInstance()
        .transaction()
        .execute(async (trx) => {
          // Step 2: Client unwinds local changes
          console.log(`Step 2: Unwinding local changes...`);
          const localOps = await unwindLocalChanges(trx);
          console.log(`Unwound ${localOps.length} local operations`);
          console.log(`Local operations:`, localOps);

          // Step 3: Client builds rebased local operations list (stub)
          console.log(`Step 3: Building rebased local operations list...`);
          const rebasedLocalOps = rebaseLocalOperations(localOps, remoteOps);
          console.log(`Rebased to ${rebasedLocalOps.length} operations`);
          console.log(`Rebased operations:`, rebasedLocalOps);

          // Step 4: Client applies changes (stub - only apply rebased local ops)
          console.log(`Step 4: Applying rebased local operations...`);
          for (const operation of rebasedLocalOps) {
            await applyOperationMergedDB(trx, operation);
          }
          console.log(
            `Applied ${rebasedLocalOps.length} rebased local operations`
          );
        });

      // Refresh the UI to show the updated state
      await refreshData();

      setSyncStatus({ type: `success` });
    } catch (error) {
      console.error(`Sync failed:`, error);
      setSyncStatus({
        type: `failure`,
        message: error instanceof Error ? error.message : `Unknown sync error`,
      });
    }
  };

  onMount(() => {
    void (async () => {
      await refreshData();
      const interval = setInterval(() => void refreshData(), 5000);
      return () => clearInterval(interval);
    })();
  });

  return (
    <div
      class={[defined(styles[`container`]), props.className ?? ``]
        .filter(isDefined)
        .join(` `)}
    >
      <div class={defined(styles[`header`])}>
        <h1 class={defined(styles[`title`])}>{props.title}</h1>
        {props.showSyncButton ?? false ? (
          <SyncButton onClick={() => void handleSync()} status={syncStatus()} />
        ) : null}
      </div>
      <AddItemForm
        onAdd={(name) => void handleAdd(name)}
        suggestions={suggestions()}
      />
      <div class={defined(styles[`list`])}>
        <Index each={sortedItems()}>
          {(item) => (
            <GroceryItem
              item={item()}
              onEdit={(id, newName) => void handleEdit(id, newName)}
              onToggle={(id, checked) => void handleToggle(id, checked)}
            />
          )}
        </Index>
      </div>
    </div>
  );
};
