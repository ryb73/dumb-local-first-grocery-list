import { type Kysely, Migrator } from "kysely";
import type { DB } from "./main-db.js";
import { devMigrations, migrations } from "./migrations.js";

export function createMigrator(kysely: Kysely<DB>, dev = false) {
  return new Migrator({
    db: kysely,
    provider: {
      getMigrations: () => Promise.resolve(dev ? devMigrations : migrations),
    },
  });
}
