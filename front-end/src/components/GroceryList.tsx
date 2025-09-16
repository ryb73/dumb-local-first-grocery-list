import { applyAndLogOperation } from "@grocery-list/shared";
import type { Item, Operation } from "@grocery-list/shared";
import {
  defined,
  isDefined,
} from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { Index, createSignal, onMount } from "solid-js";
import type { Database } from "../db/database";
import {
  rebaseLocalOperations,
  syncWithServer,
  unwindLocalChanges,
  updateOperationLogAfterSync,
} from "../sync";
import type { SyncResponse } from "../sync/server/sync";
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
      // Step 1: Call combined sync endpoint
      console.log(`Step 1: Calling combined sync endpoint...`);
      const syncResponse = await syncWithServer(props.db.getKyselyInstance());

      console.log(`Sync response:`, syncResponse);
      console.log(`Status: ${syncResponse.status}`);

      // Check for migration incompatibility
      if (syncResponse.status === `migration_incompatible`) {
        setSyncStatus({
          type: `failure`,
          message: syncResponse.errorMessage,
        });
        return;
      }

      // If local operations were rejected (due to remote changes), apply remote changes and retry
      if (syncResponse.status === `rejected`) {
        console.log(
          `Remote operations: ${syncResponse.remoteOperations.length}`
        );
        console.log(
          `Local operations rejected, applying remote changes and retrying...`
        );

        // Variable to store rebased operations
        let rebasedLocalOps: Operation[] = [];

        // Steps 2-4: Execute within a single transaction for atomicity
        await props.db
          .getKyselyInstance()
          .transaction()
          .execute(async (trx) => {
            // Step 2: Client unwinds local changes
            console.log(`Step 2: Unwinding local changes...`);
            const unwoundLocalOps = await unwindLocalChanges(trx);
            console.log(`Unwound ${unwoundLocalOps.length} local operations`);

            // Step 3: Client builds rebased local operations list
            console.log(`Step 3: Building rebased local operations list...`);
            rebasedLocalOps = rebaseLocalOperations(
              unwoundLocalOps,
              syncResponse.remoteOperations
            );
            console.log(`Rebased to ${rebasedLocalOps.length} operations`);

            // Step 4: Client applies changes - remote operations first, then rebased local operations
            console.log(`Step 4: Applying remote operations...`);
            for (const operation of syncResponse.remoteOperations) {
              await applyAndLogOperation(trx, operation);
            }
            console.log(
              `Applied ${syncResponse.remoteOperations.length} remote operations`
            );

            console.log(`Step 4: Applying rebased local operations...`);
            for (const operation of rebasedLocalOps) {
              await applyAndLogOperation(trx, operation);
            }
            console.log(
              `Applied ${rebasedLocalOps.length} rebased local operations`
            );
          });

        // Step 5: Retry sync with rebased operations
        if (rebasedLocalOps.length > 0) {
          console.log(`Step 5: Retrying sync with rebased operations...`);
          const retryResponse: SyncResponse = await syncWithServer(
            props.db.getKyselyInstance()
          );

          if (
            retryResponse.status === `rejected` ||
            retryResponse.status === `migration_incompatible`
          ) {
            throw new Error(
              `Sync failed: rebased operations were still rejected`
            );
          }

          // Update operation log with commit timestamps
          await props.db
            .getKyselyInstance()
            .transaction()
            .execute(async (trx) => {
              await updateOperationLogAfterSync(
                trx,
                retryResponse.commitTimestamps
              );
            });

          console.log(
            `Successfully completed sync after retry with ${rebasedLocalOps.length} rebased operations`
          );
        } else {
          console.log(
            `No rebased operations to submit after applying remote changes`
          );
        }
      } else {
        // Status is accepted - handle accepted local operations
        if (syncResponse.commitTimestamps.size > 0) {
          // Local operations were accepted, update operation log
          await props.db
            .getKyselyInstance()
            .transaction()
            .execute(async (trx) => {
              await updateOperationLogAfterSync(
                trx,
                syncResponse.commitTimestamps
              );
            });
        }

        console.log(
          `Successfully completed sync with ${syncResponse.commitTimestamps.size} accepted local operations`
        );
      }

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
