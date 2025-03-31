import { type Kysely, Migrator } from "kysely";
import { migrations } from "./migrations.ts";
import { DB } from "../../../db";

export function createMigrator(kysely: Kysely<DB>) {
  return new Migrator({
    db: kysely,
    provider: {
      async getMigrations() {
        return migrations;
      },
    },
  });
}
