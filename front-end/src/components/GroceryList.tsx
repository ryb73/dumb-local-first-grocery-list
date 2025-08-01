import {
  defined,
  isDefined,
} from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { Index, createSignal, onMount } from "solid-js";
import type { Database } from "../db/database";
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
  const [syncStatus, setSyncStatus] = createSignal<SyncStatus>(`idle`);

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
    // TODO: catch and handle errors

    if (syncStatus() === `syncing`) return;

    setSyncStatus(`syncing`);

    // Simulate sync operation that fails immediately with "Not implemented"
    await new Promise((resolve) => {
      // Brief delay to show syncing state
      setTimeout(resolve, 1000);
    });

    setSyncStatus(`failure`);
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
