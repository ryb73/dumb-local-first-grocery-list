import { type Kysely, Migrator } from "kysely";
import { migrations } from "./migrations.ts";
import type { KyselySchema } from "../types.ts";

export function createMigrator(kysely: Kysely<KyselySchema>) {
  return new Migrator({
    db: kysely,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });
}
