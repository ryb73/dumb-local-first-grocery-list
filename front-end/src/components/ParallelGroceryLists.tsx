import { initMergedDatabase } from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { type Component, Show, createResource } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

export const ParallelGroceryLists: Component = () => {
  const [dbs] = createResource(async () => {
    // TEMPORARY: Use hardcoded list ID until Phase 4 routing is implemented
    // Note: Using "-one" and "-two" suffixes to simulate two clients accessing the same list
    // Both will sync with the server using just "default-list" (without suffix)
    const TEMP_LIST_ID = `default-list`;

    const [kysely1, kysely2] = await Promise.all([
      initMergedDatabase(
        `${TEMP_LIST_ID}-one.log.sqlite3`,
        new SQLocalKysely(`${TEMP_LIST_ID}-one.sqlite3`).dialect,
        new SQLocalKysely(`${TEMP_LIST_ID}-one.log.sqlite3`).dialect,
        true
      ),
      initMergedDatabase(
        `${TEMP_LIST_ID}-two.log.sqlite3`,
        new SQLocalKysely(`${TEMP_LIST_ID}-two.sqlite3`).dialect,
        new SQLocalKysely(`${TEMP_LIST_ID}-two.log.sqlite3`).dialect,
        true
      ),
    ]);

    const db1 = new Database(kysely1);
    const db2 = new Database(kysely2);

    return { db1, db2 };
  });

  return (
    <>
      <Show fallback={<div>Loading...</div>} keyed when={dbs()}>
        {/* eslint-disable-next-line @typescript-eslint/no-shadow */}
        {(dbs) => (
          <div class={defined(styles[`container`])}>
            <GroceryList
              className={defined(styles[`list`])}
              db={dbs.db1}
              showSyncButton
              title="List 1"
            />
            <GroceryList
              className={defined(styles[`list`])}
              db={dbs.db2}
              showSyncButton
              title="List 2"
            />
          </div>
        )}
      </Show>
    </>
  );
};
