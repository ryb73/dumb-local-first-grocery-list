import { Kysely } from "kysely";
import { DB } from "../../db";
import { ItemUpdate } from "../types/schemas";

export class Database {
  private readonly kysely: Kysely<DB>;

  constructor(kysely: Kysely<DB>) {
    this.kysely = kysely;
  }

  async addItem(name: string) {
    // First try to update an existing item to checked state
    const existingRow = await this.kysely
      .selectFrom("items")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    if (existingRow) {
      await this.kysely
        .updateTable("items")
        .set({ checked: 1 })
        .where("id", "=", existingRow.id)
        .execute();
    } else {
      await this.kysely
        .insertInto("items")
        .values({
          id: crypto.randomUUID(),
          name,
          created_at: Date.now(),
          checked: 1,
        })
        .execute();
    }
  }

  async getItems() {
    const dayAgo = Date.now() - 3000;
    return await this.kysely
      .selectFrom("items")
      .selectAll()
      .where((eb) =>
        eb(`items.checked`, "=", 1).or(`items.last_unchecked_at`, ">", dayAgo)
      )
      .execute();
  }

  async getSuggestions() {
    // Get unchecked items as suggestions
    const results = await this.kysely
      .selectFrom("items")
      .select(["name"])
      .where("checked", "=", 0)
      .execute();
    return results.map((result) => result.name);
  }

  async toggleItem(id: string, checked: boolean): Promise<void> {
    const item = await this.getItem(id);
    if (!item) return;

    await this.updateItem(id, { checked: checked ? 1 : 0 });
  }

  async updateItem(id: string, updates: Omit<ItemUpdate, "id">): Promise<void> {
    const item = await this.getItem(id);
    if (!item) return;

    const updatedItem = { ...item, ...updates };
    await this.kysely
      .updateTable("items")
      .set(updatedItem)
      .where("id", "=", id)
      .execute();
  }

  async getItem(id: string) {
    return await this.kysely
      .selectFrom("items")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }
}
