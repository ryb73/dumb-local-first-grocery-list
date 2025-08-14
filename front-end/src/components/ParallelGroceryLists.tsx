import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { type Component, Show, createResource } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database";
import { initMergedDatabase } from "../db/init";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

export const ParallelGroceryLists: Component = () => {
  const [dbs] = createResource(async () => {
    const [kysely1, kysely2] = await Promise.all([
      initMergedDatabase(
        `grocery-list.log.sqlite3`,
        new SQLocalKysely(`grocery-list.sqlite3`).dialect,
        new SQLocalKysely(`grocery-list.log.sqlite3`).dialect
      ),
      initMergedDatabase(
        `grocery-list-2.log.sqlite3`,
        new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
        new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect
      ),
    ]);

    const db1 = new Database(kysely1, false);
    const db2 = new Database(kysely2, true);

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
              title="List 2"
            />
          </div>
        )}
      </Show>
    </>
  );
};
