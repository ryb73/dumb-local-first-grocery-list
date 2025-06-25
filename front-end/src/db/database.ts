import type { Kysely } from "kysely";
import type { DB } from "../../db";
import type { ItemUpdate } from "../types/schemas";

export class Database {
  private readonly kysely: Kysely<DB>;

  public constructor(kysely: Kysely<DB>) {
    this.kysely = kysely;
  }

  public async addItem(name: string) {
    // First try to update an existing item to an unchecked state
    const existingRow = await this.kysely
      .selectFrom(`items`)
      .selectAll()
      .where(`name`, `=`, name)
      .executeTakeFirst();
    await (existingRow != null
      ? this.kysely
          .updateTable(`items`)
          .set({ checked: 0 })
          .where(`id`, `=`, existingRow.id)
          .execute()
      : this.kysely
          .insertInto(`items`)
          .values({
            id: crypto.randomUUID(),
            name,
            created_at: Date.now(),
            checked: 0,
          })
          .execute());
  }

  public async getItems() {
    const dayAgo = Date.now() - 3000;
    return await this.kysely
      .selectFrom(`items`)
      .selectAll()
      .where((eb) =>
        eb(`items.checked`, `=`, 0).or(`items.last_checked_at`, `>`, dayAgo)
      )
      .execute();
  }

  public async getSuggestions() {
    // Get checked items as suggestions
    const results = await this.kysely
      .selectFrom(`items`)
      .select([`name`])
      .where(`checked`, `=`, 1)
      .execute();
    return results.map((result) => result.name);
  }

  public async toggleItem(id: string, checked: boolean): Promise<void> {
    const item = await this.getItem(id);
    if (item == null) return;

    await this.updateItem(id, {
      checked: checked ? 1 : 0,
      last_checked_at: checked ? Date.now() : item.last_checked_at,
    });
  }

  public async updateItem(
    id: string,
    updates: Omit<ItemUpdate, "id">
  ): Promise<void> {
    const item = await this.getItem(id);
    if (item == null) return;

    const updatedItem = { ...item, ...updates };
    await this.kysely
      .updateTable(`items`)
      .set(updatedItem)
      .where(`id`, `=`, id)
      .execute();
  }

  public async getItem(id: string) {
    return await this.kysely
      .selectFrom(`items`)
      .selectAll()
      .where(`id`, `=`, id)
      .executeTakeFirst();
  }
}
