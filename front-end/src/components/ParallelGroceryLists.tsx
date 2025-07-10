import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database";
import { initMergedDatabase } from "../db/init";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

const kysely1 = await initMergedDatabase(
  `grocery-list.log.sqlite3`,
  new SQLocalKysely(`grocery-list.sqlite3`).dialect,
  new SQLocalKysely(`grocery-list.log.sqlite3`).dialect
);
const kysely2 = await initMergedDatabase(
  `grocery-list-2.log.sqlite3`,
  new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
  new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect
);

const db1 = new Database(kysely1, false);
const db2 = new Database(kysely2, true);

export const ParallelGroceryLists: Component = () => (
  <div class={defined(styles[`container`])}>
    <GroceryList className={defined(styles[`list`])} db={db1} title="List 1" />
    <GroceryList className={defined(styles[`list`])} db={db2} title="List 2" />
  </div>
);
