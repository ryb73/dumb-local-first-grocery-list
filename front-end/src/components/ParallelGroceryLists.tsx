import { initMergedDatabase } from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { type Component, Show, createResource } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

type ParallelGroceryListsProps = {
  /**
   * The list ID to use for both parallel grocery lists.
   * Defaults to "default-list" for backwards compatibility.
   */
  listId: string;
};

export const ParallelGroceryLists: Component<ParallelGroceryListsProps> = (
  props
) => {
  const [dbs] = createResource(async () => {
    // Note: Using "-one" and "-two" suffixes to simulate two clients accessing the same list
    // Both will sync with the server using the base listId (without suffix)
    const currentListId = props.listId;

    const [kysely1, kysely2] = await Promise.all([
      initMergedDatabase(
        `${currentListId}-one.log.sqlite3`,
        new SQLocalKysely(`${currentListId}-one.sqlite3`).dialect,
        new SQLocalKysely(`${currentListId}-one.log.sqlite3`).dialect,
        true
      ),
      initMergedDatabase(
        `${currentListId}-two.log.sqlite3`,
        new SQLocalKysely(`${currentListId}-two.sqlite3`).dialect,
        new SQLocalKysely(`${currentListId}-two.log.sqlite3`).dialect,
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
              listId={props.listId}
              showSyncButton
            />
            <GroceryList
              className={defined(styles[`list`])}
              db={dbs.db2}
              listId={props.listId}
              showSyncButton
            />
          </div>
        )}
      </Show>
    </>
  );
};
