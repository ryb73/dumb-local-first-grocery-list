import { Kysely } from "kysely";
import { KyselySchema } from "./types";
import { Item } from "../types/schemas";

export class Database {
  private readonly kysely: Kysely<KyselySchema>;

  constructor(kysely: Kysely<KyselySchema>) {
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
        .set({ checked: 1 as unknown as boolean })
        .where("id", "=", existingRow.id)
        .execute();
    } else {
      await this.kysely
        .insertInto("items")
        .values({
          id: crypto.randomUUID(),
          name,
          created_at: Date.now(),
          checked: 1 as unknown as boolean,
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
        eb(`items.checked`, "=", 1 as unknown as boolean).or(
          `items.last_unchecked_at`,
          ">",
          dayAgo
        )
      )
      .execute();
  }

  async getSuggestions() {
    // Get unchecked items as suggestions
    const results = await this.kysely
      .selectFrom("items")
      .select(["name"])
      .where("checked", "=", 0 as unknown as boolean)
      .execute();
    return results.map((result) => result.name);
  }

  async toggleItem(id: string, checked: boolean): Promise<void> {
    const item = await this.getItem(id);
    if (!item) return;

    await this.updateItem(id, { checked });
  }

  async updateItem(
    id: string,
    updates: Partial<Omit<Item, "id">>
  ): Promise<void> {
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
