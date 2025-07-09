import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database";
import { initTestDatabases } from "../db/init";
import { GroceryList } from "./GroceryList";
import styles from "./ParallelGroceryLists.module.css";

const { db1: kysely1, db2: kysely2 } = await initTestDatabases(
  new SQLocalKysely(`grocery-list.sqlite3`).dialect,
  new SQLocalKysely(`grocery-list-2.sqlite3`).dialect
);

const db1 = new Database(kysely1);
const db2 = new Database(kysely2);

export const ParallelGroceryLists: Component = () => (
  <div class={defined(styles[`container`])}>
    <GroceryList className={defined(styles[`list`])} db={db1} title="List 1" />
    <GroceryList className={defined(styles[`list`])} db={db2} title="List 2" />
  </div>
);
