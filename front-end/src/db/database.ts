import { initDatabase } from "./init";

const { kysely } = await initDatabase();

export class Database {
  async addItem(name: string) {
    // First try to update an existing item to checked state
    const existingRow = await kysely
      .selectFrom("items")
      .selectAll()
      .where("name", "=", name)
      .executeTakeFirst();
    if (existingRow) {
      await kysely
        .updateTable("items")
        .set({ checked: 1 as unknown as boolean })
        .where("id", "=", existingRow.id)
        .execute();
    } else {
      await kysely
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
    return await kysely.selectFrom("items").selectAll().execute();
  }

  async getSuggestions() {
    // Get unchecked items as suggestions
    const results = await kysely
      .selectFrom("items")
      .select(["name"])
      .where("checked", "=", 0 as unknown as boolean)
      .execute();
    return results.map((result) => result.name);
  }

  async toggleItem(id: string, checked: boolean) {
    const timestamp = Date.now();
    await kysely
      .updateTable("items")
      .set({
        checked: checked
          ? (1 as unknown as boolean)
          : (0 as unknown as boolean),
        last_unchecked_at: checked ? null : timestamp,
      })
      .where("id", "=", id)
      .execute();
  }
}

export const db = new Database();
