import type { Kysely } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import type { Operation } from "../../operation-logging/operation-types";
import { operationSchema } from "../../operation-logging/operation-types";

/**
 * Retrieves all local operations that haven't been committed to the server.
 * These are operations that need to be synced.
 *
 * @param clientDb The client's database connection
 * @returns Array of parsed local operations ready for sync
 */
export async function getLocalOperations(
  clientDb: Kysely<MergedDB>
): Promise<Operation[]> {
  // Get all local operations that haven't been committed to the server
  const localOps = await clientDb
    .selectFrom(`op_log.operations`)
    .selectAll()
    .where(`server_committed_at`, `is`, null)
    .orderBy(`client_created_at`, `asc`)
    .execute();

  // Transform and parse local operations
  const transformedLocalOps = localOps.map((rawOp) => ({
    clientCreatedAt: rawOp.client_created_at,
    id: rawOp.id,
    payload: JSON.parse(rawOp.payload),
    serverCommittedAt: rawOp.server_committed_at,
    type: rawOp.type,
  }));

  // Parse and validate the operations
  return operationSchema.array().parse(transformedLocalOps);
}
