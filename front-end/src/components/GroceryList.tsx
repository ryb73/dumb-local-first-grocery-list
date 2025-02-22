import { Component, createSignal, onMount, createEffect, For } from "solid-js";
import { GroceryItem as IGroceryItem } from "../types/types";
import { db } from "../db/database";
import { GroceryItem } from "./GroceryItem";
import { AddItemForm } from "./AddItemForm";
import styles from "./GroceryList.module.css";

export const GroceryList: Component = () => {
  const [items, setItems] = createSignal<IGroceryItem[]>([]);
  const [suggestions, setSuggestions] = createSignal<string[]>([]);

  const sortedItems = () => {
    return [...items()].sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? -1 : 1;
    });
  };

  const refreshData = async () => {
    setItems(await db.getItems());
    setSuggestions(await db.getSuggestions());
  };

  const handleAdd = async (name: string) => {
    await db.addItem(name);
    await refreshData();
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await db.toggleItem(id, checked);
    await refreshData();
  };

  onMount(async () => {
    await db.initialize();
    await refreshData();
  });

  createEffect(() => {
    const interval = setInterval(async () => {
      await db.cleanupOldItems();
      await refreshData();
    }, 5000);

    return () => clearInterval(interval);
  });

  return (
    <div class={styles.container}>
      <h1 class={styles.title}>Grocery List</h1>
      <AddItemForm suggestions={suggestions()} onAdd={handleAdd} />
      <div class={styles.list}>
        <For each={sortedItems()}>
          {(item) => <GroceryItem item={item} onToggle={handleToggle} />}
        </For>
      </div>
    </div>
  );
};
