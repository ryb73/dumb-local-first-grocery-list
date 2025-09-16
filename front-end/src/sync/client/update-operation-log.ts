import type { MergedDB } from "@grocery-list/shared";
import type { Transaction } from "kysely";

/**
 * Updates the client's operation log to mark operations as server-committed.
 * This should be called after successfully submitting rebased changes to the server.
 *
 * @param trx Transaction to execute within
 * @param commitTimestamps Map of operation ID to server commit timestamp
 */
export async function updateOperationLogAfterSync(
  trx: Transaction<MergedDB>,
  commitTimestamps: Map<string, number>
): Promise<void> {
  console.log(
    `Updating operation log with ${commitTimestamps.size} commit timestamps`
  );

  // Update each operation's server_committed_at timestamp
  for (const [operationId, commitTimestamp] of commitTimestamps) {
    await trx
      .updateTable(`op_log.operations`)
      .set({ server_committed_at: commitTimestamp })
      .where(`id`, `=`, operationId)
      .execute();
  }

  console.log(
    `Successfully updated operation log for ${commitTimestamps.size} operations`
  );
}
