import type { Transaction } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import type { Operation } from "../../operation-logging/operation-types";
import { operationSchema } from "../../operation-logging/operation-types";
import { reverseOperationMergedDB } from "../../operation-logging/reverse-operation";

/**
 * Unwinds (rolls back) all local, unsynced changes from the client database.
 * This returns the database to the state it was in at the point of the last successful sync.
 *
 * This implements step 2 of the sync algorithm from PRIMARY.md:
 * "Client Unwinds Local Changes: The client unwinds (rolls back) any local, unsynced
 * changes (localOps) that have been applied since the last known server state."
 *
 * @param trx The transaction to execute within (allows caller to manage transaction scope)
 * @returns Array of local operations that were unwound, in their original order (for later rebasing)
 */
export async function unwindLocalChanges(
  trx: Transaction<MergedDB>
): Promise<Operation[]> {
  // Get all local operations that haven't been committed to the server
  const rawLocalOps = await trx
    .selectFrom(`op_log.operations`)
    .selectAll()
    .where(`server_committed_at`, `is`, null)
    .orderBy(`client_created_at`, `desc`) // Most recent first for unwinding
    .execute();

  // Transform raw operations to the expected format for parsing
  const transformedOps = rawLocalOps.map((rawOp) => ({
    clientCreatedAt: rawOp.client_created_at,
    id: rawOp.id,
    payload: JSON.parse(rawOp.payload),
    serverCommittedAt: rawOp.server_committed_at,
    type: rawOp.type,
  }));

  // Parse and validate the operations
  const localOps = operationSchema.array().parse(transformedOps);

  // Apply reverse operations in reverse chronological order (most recent first)
  // This ensures that dependent operations are unwound in the correct sequence
  for (const operation of localOps) {
    await reverseOperationMergedDB(trx, operation);
  }

  // Return operations in their original chronological order (oldest first)
  // This is the order they should be used for rebasing
  localOps.reverse();
  return localOps;
}
