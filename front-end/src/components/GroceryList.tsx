import { Component, createSignal, onMount, Index } from "solid-js";
import { isDefined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { GroceryItem } from "./GroceryItem";
import { AddItemForm } from "./AddItemForm";
import styles from "./GroceryList.module.css";
import { Item } from "../types/schemas";
import { Database } from "../db/database";

interface GroceryListProps {
  db: Database;
  title: string;
  className?: string;
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

  const handleEdit = async (id: string, newName: string) => {
    await props.db.updateItem(id, { name: newName });
    await refreshData();
  };

  onMount(async () => {
    await refreshData();
    const interval = setInterval(refreshData, 5000);
    return () => clearInterval(interval);
  });

  return (
    <div
      class={[styles.container, props.className ?? ""]
        .filter(isDefined)
        .join(` `)}
    >
      <h1 class={styles.title}>{props.title}</h1>
      <AddItemForm suggestions={suggestions()} onAdd={handleAdd} />
      <div class={styles.list}>
        <Index each={sortedItems()}>
          {(item) => (
            <GroceryItem
              item={item()}
              onToggle={handleToggle}
              onEdit={handleEdit}
            />
          )}
        </Index>
      </div>
    </div>
  );
};
