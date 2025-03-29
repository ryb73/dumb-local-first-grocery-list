import { Component, createSignal, onMount, createEffect, For } from "solid-js";
import { GroceryItem } from "./GroceryItem";
import { AddItemForm } from "./AddItemForm";
import styles from "./GroceryList.module.css";
import { Item } from "../types/schemas";
import { Database } from "../db/database";

interface GroceryListProps {
  db: Database;
  title: string;
}

export const GroceryList: Component<GroceryListProps> = (props) => {
  const [items, setItems] = createSignal<Item[]>([]);
  const [suggestions, setSuggestions] = createSignal<string[]>([]);

  const sortedItems = () => {
    return [...items()].sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? -1 : 1;
    });
  };

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

  onMount(async () => {
    await refreshData();
  });

  createEffect(refreshData);

  return (
    <div class={styles.container}>
      <h1 class={styles.title}>{props.title}</h1>
      <AddItemForm suggestions={suggestions()} onAdd={handleAdd} />
      <div class={styles.list}>
        <For each={sortedItems()}>
          {(item) => <GroceryItem item={item} onToggle={handleToggle} />}
        </For>
      </div>
    </div>
  );
};
