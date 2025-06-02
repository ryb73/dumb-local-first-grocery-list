import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { createSignal, onMount } from "solid-js";
import { Database } from "../db/database";
import { initTestDatabases } from "../db/init";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

type ParallelGroceryListsProps = {
  db1: Database;
  db2: Database;
};

export const ParallelGroceryLists: Component = () => {
  const [databases, setDatabases] =
    createSignal<ParallelGroceryListsProps | null>(null);

  onMount(() => {
    void (async () => {
      const { db1, db2 } = await initTestDatabases();
      setDatabases({
        db1: new Database(db1.kysely),
        db2: new Database(db2.kysely),
      });
    })();
  });

  return (
    <div class={defined(styles[`container`])}>
      {databases() !== null ? (
        <>
          <GroceryList
            className={defined(styles[`list`])}
            db={databases()!.db1}
            title="List 1"
          />
          <GroceryList
            className={defined(styles[`list`])}
            db={databases()!.db2}
            title="List 2"
          />
        </>
      ) : (
        <div class={defined(styles[`loading`])}>Loading...</div>
      )}
    </div>
  );
};
