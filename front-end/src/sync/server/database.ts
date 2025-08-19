import type { Kysely } from "kysely";
import { SQLocalKysely } from "sqlocal/kysely";
import { initMergedDatabase } from "../../db/init";
import type { MergedDB } from "../../db/merged-db";

/**
 * Creates a connection to the server database.
 * In production, this would be replaced with actual server database connection logic.
 */
export async function getServerDatabase(): Promise<Kysely<MergedDB>> {
  return await initMergedDatabase(
    `grocery-list-2.log.sqlite3`,
    new SQLocalKysely(`grocery-list-2.sqlite3`).dialect,
    new SQLocalKysely(`grocery-list-2.log.sqlite3`).dialect
  );
}
