import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { MergedDB } from "../../db/merged-db";

/**
 * Gets the last known server version (timestamp) that the client has synced with.
 * This is determined by finding the latest server_committed_at value from operations
 * in the client's operation log that have a non-null server_committed_at.
 */
export async function getLastKnownServerVersion(
  clientDb: Kysely<MergedDB>
): Promise<number | null> {
  const result = await sql<{ max_server_committed_at: number | null }>`
    SELECT MAX(server_committed_at) as max_server_committed_at
    FROM op_log.operations
    WHERE server_committed_at IS NOT NULL
  `.execute(clientDb);

  return result.rows[0]?.max_server_committed_at ?? null;
}
