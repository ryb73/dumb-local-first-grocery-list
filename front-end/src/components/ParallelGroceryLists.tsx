import { Component, createSignal, onMount } from "solid-js";
import { initTestDatabases } from "../db/init";
import { Database } from "../db/database";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

interface ParallelGroceryListsProps {
  db1: Database;
  db2: Database;
}

export const ParallelGroceryLists: Component = () => {
  const [databases, setDatabases] =
    createSignal<ParallelGroceryListsProps | null>(null);

  onMount(async () => {
    const { db1, db2 } = await initTestDatabases();
    setDatabases({
      db1: new Database(db1.kysely),
      db2: new Database(db2.kysely),
    });
  });

  return (
    <div class={styles.container}>
      {databases() !== null ? (
        <>
          <GroceryList className={styles.list} db={databases()!.db1} title="List 1" />
          <GroceryList className={styles.list} db={databases()!.db2} title="List 2" />
        </>
      ) : (
        <div class={styles.loading}>Loading...</div>
      )}
    </div>
  );
};
