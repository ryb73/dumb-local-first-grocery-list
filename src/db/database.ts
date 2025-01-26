import { sqlite3Worker1Promiser } from "@sqlite.org/sqlite-wasm";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS active_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    checked INTEGER DEFAULT 1,
    created_at INTEGER,
    last_unchecked_at INTEGER
);

CREATE TABLE IF NOT EXISTS removed_items (
    name TEXT PRIMARY KEY,
    last_removed_at INTEGER
);
`;

export class Database {
  private promiser: any;
  private dbId: string;

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
      dbid: this.dbId,
      sql: SCHEMA,
    });
  }

  async addItem(name: string) {
    return this.promiser("exec", {
      dbid: this.dbId,
      sql: `INSERT INTO active_items (id, name, created_at) VALUES (?, ?, ?)`,
      bind: [crypto.randomUUID(), name, Date.now()],
    });
  }

  // ... additional methods will follow
}

export const db = new Database();
