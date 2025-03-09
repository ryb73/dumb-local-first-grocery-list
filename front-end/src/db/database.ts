import { Promiser, sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";
import {
  activeItemSchema,
  removedItemSchema,
  ActiveItem,
} from "../types/schemas";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS active_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    checked INTEGER DEFAULT 1,
    created_at INTEGER,
    last_unchecked_at INTEGER
);

CREATE TABLE IF NOT EXISTS removed_items (
    name TEXT PRIMARY KEY
);
`;

export class Database {
  private promiser?: Promiser;
  private dbId?: string;

  async initialize() {
    this.promiser = await new Promise((resolve) => {
      const _promiser = sqlite3Worker1Promiser({
        onready: () => resolve(_promiser),
      });
    });

    const openResponse = await this.promiser("open", {
      filename: "file:grocery-list.sqlite3?vfs=opfs",
    });
    this.dbId = openResponse.dbId;

    await this.promiser("exec", {
      dbId: this.dbId,
      sql: SCHEMA,
    });
  }

  async addItem(name: string) {
    // First try to update an existing item to checked state
    let existingId: string | null = null;
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: `UPDATE active_items SET checked = 1 WHERE name = ? RETURNING id`,
      bind: [name],
      rowMode: "array",
      callback: (result) => {
        if (result.row) {
          existingId = result.row[0];
        }
      },
    });

    // If no existing item was found, insert a new one
    if (!existingId) {
      await this.promiser!("exec", {
        dbId: this.dbId,
        sql: `INSERT INTO active_items (id, name, created_at) VALUES (?, ?, ?)`,
        bind: [crypto.randomUUID(), name, Date.now()],
      });
    }

    // Remove from removed_items if it exists there
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: `DELETE FROM removed_items WHERE name = ?`,
      bind: [name],
    });
  }

  async getItems() {
    const items: ActiveItem[] = [];
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: "SELECT * FROM active_items",
      rowMode: "object",
      callback: (result) => {
        if (result.row) {
          const parsed = activeItemSchema.safeParse(result.row);
          if (parsed.success) {
            items.push(parsed.data);
          } else {
            console.error("Failed to parse row:", result.row, parsed.error);
          }
        }
      },
    });
    return items;
  }

  async getSuggestions() {
    const suggestions: string[] = [];
    await this.promiser!("exec", {
      dbid: this.dbId,
      sql: "SELECT name FROM removed_items",
      rowMode: "object",
      callback: (result) => {
        if (result.row) {
          // For suggestions we only need the name, but validate the full row structure
          const parsed = removedItemSchema.safeParse(result.row);
          if (parsed.success) {
            suggestions.push(parsed.data.name);
          } else {
            console.error(
              "Failed to parse removed item:",
              result.row,
              parsed.error
            );
          }
        }
      },
    });
    return suggestions;
  }

  async toggleItem(id: string, checked: boolean) {
    const timestamp = Date.now();
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: `UPDATE active_items
            SET checked = ?,
                last_unchecked_at = ?
            WHERE id = ?`,
      bind: [checked ? 1 : 0, checked ? null : timestamp, id],
    });
  }

  async cleanupOldItems() {
    // const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dayAgo = Date.now() - 3000;

    // First, move unchecked items to removed_items
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: `INSERT OR REPLACE INTO removed_items (name)
            SELECT name
            FROM active_items
            WHERE checked = 0`,
      bind: [dayAgo],
    });

    // Then delete them from active_items
    await this.promiser!("exec", {
      dbId: this.dbId,
      sql: `DELETE FROM active_items
            WHERE checked = 0
            AND last_unchecked_at < ?`,
      bind: [dayAgo],
    });
  }
}

export const db = new Database();
