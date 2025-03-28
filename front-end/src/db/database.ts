import { SQLocalKysely } from "sqlocal/kysely";
import { Kysely } from "kysely";
import { ActiveItem, removedItemSchema } from "../types/schemas";
import { KyselySchema } from "./types";

const { dialect } = new SQLocalKysely("grocery-list.sqlite3");
const kysely = new Kysely<KyselySchema>({ dialect });

// Initialize the database
await kysely.schema
  .createTable("active_items")
  .ifNotExists()
  .addColumn("id", "text", (col) => col.primaryKey())
  .addColumn("name", "text", (col) => col.notNull().unique())
  .addColumn("checked", "integer", (col) => col.defaultTo(1))
  .addColumn("created_at", "integer")
  .addColumn("last_unchecked_at", "integer")
  .execute();

await kysely.schema
  .createTable("removed_items")
  .ifNotExists()
  .addColumn("name", "text", (col) => col.primaryKey())
  .execute();

export class Database {
  async addItem(name: string) {
    // First try to update an existing item to checked state
    const existingRow = await kysely
      .selectFrom("active_items")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    if (existingRow) {
      await kysely
        .updateTable("active_items")
        .set({ checked: 1 as unknown as boolean })
        .where("id", "=", existingRow.id)
        .execute();
    } else {
      await kysely
        .insertInto("active_items")
        .values({
          id: crypto.randomUUID(),
          name,
          created_at: Date.now(),
          checked: 1 as unknown as boolean,
        })
        .execute();
    }

    // Remove from removed_items if it exists there
    await kysely.deleteFrom("removed_items").where("name", "=", name).execute();
  }

  async getItems() {
    return await kysely.selectFrom("active_items").selectAll().execute();
  }

  async getSuggestions() {
    const results = await kysely
      .selectFrom("removed_items")
      .selectAll()
      .execute();
    return results.map((result) => result.name);
  }

  async toggleItem(id: string, checked: boolean) {
    const timestamp = Date.now();
    await kysely
      .updateTable("active_items")
      .set({
        checked: checked
          ? (1 as unknown as boolean)
          : (0 as unknown as boolean),
        last_unchecked_at: checked ? null : timestamp,
      })
      .where("id", "=", id)
      .execute();
  }

  async cleanupOldItems() {
    // const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dayAgo = Date.now() - 3000;

    // First, move unchecked items to removed_items
    await kysely
      .insertInto("removed_items")
      .columns(["name"])
      .expression((eb) =>
        eb
          .selectFrom("active_items")
          .select("name")
          .where("checked", "=", 0 as unknown as boolean)
          .where("last_unchecked_at", "<", dayAgo)
      )
      .onConflict((oc) => oc.doNothing())
      .execute();

    // Then delete them from active_items
    await kysely
      .deleteFrom("active_items")
      .where("checked", "=", 0 as unknown as boolean)
      .where("last_unchecked_at", "<", dayAgo)
      .execute();
  }
}

export const db = new Database();
