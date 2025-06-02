import { type Kysely, Migrator } from "kysely";
import type { DB } from "../../../db";
import { migrations } from "./migrations.ts";

export function createMigrator(kysely: Kysely<DB>) {
  return new Migrator({
    db: kysely,
    provider: {
      getMigrations: () => Promise.resolve(migrations),
    },
  });
}
