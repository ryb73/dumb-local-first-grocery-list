import { sql } from "kysely";
import { applyAndLogOperation } from "../../operation-logging/apply-operation";
import type { Operation } from "../../operation-logging/operation-types";
import { getServerDatabase } from "./database";

/**
 * Response from applying client changes on the server.
 */
export type ApplyChangesResponse = {
  /** Whether the application was successful */
  success: boolean;
  /** Error message if application failed */
  errorMessage?: string;
  /** Commit timestamps for each successfully applied operation (indexed by operation ID) */
  commitTimestamps?: Map<string, number>;
};

/**
 * Applies client changes on the server.
 * This implements step 6 of the sync algorithm from PRIMARY.md:
 * "Server Applies Changes: The server applies rebasedLocalOps atomically.
 * If successful, it returns the commit timestamps for each operation so the
 * client can update its local operation log."
 *
 * @param rebasedLocalOps The rebased local operations to apply
 * @param expectedServerVersion The expected server version for optimistic locking
 * @returns Response indicating success/failure and commit timestamps
 */
export async function applyClientChanges(
  rebasedLocalOps: Operation[],
  expectedServerVersion: number | null
): Promise<ApplyChangesResponse> {
  console.log(
    `Step 6: Applying ${
      rebasedLocalOps.length
    } client operations on server with expected version ${
      expectedServerVersion ?? `null`
    }`
  );

  const serverDb = await getServerDatabase();

  try {
    // Execute everything in a single transaction for atomicity
    const result = await serverDb.transaction().execute(async (trx) => {
      // Step 6a: Check current server version for optimistic locking
      const currentVersionResult = await sql<{
        max_server_committed_at: number | null;
      }>`
        SELECT MAX(server_committed_at) as max_server_committed_at
        FROM op_log.operations
        WHERE server_committed_at IS NOT NULL
      `.execute(trx);

      const currentServerVersion =
        currentVersionResult.rows[0]?.max_server_committed_at ?? null;

      // Version mismatch check
      if (currentServerVersion !== expectedServerVersion) {
        return {
          success: false,
          errorMessage: `Version mismatch: expected ${
            expectedServerVersion ?? `null`
          }, current ${currentServerVersion ?? `null`}.`,
        };
      }

      // Step 6b: Apply operations and log them with server timestamps
      const commitTimestamps = new Map<string, number>();

      for (const operation of rebasedLocalOps) {
        // Generate commit timestamp for this operation
        const commitTimestamp = Date.now();
        commitTimestamps.set(operation.id, commitTimestamp);

        // Apply the operation and log it with the server commit timestamp
        const operationWithServerTimestamp = {
          ...operation,
          serverCommittedAt: commitTimestamp,
        };
        await applyAndLogOperation(trx, operationWithServerTimestamp);
      }

      return {
        success: true,
        commitTimestamps,
      };
    });

    console.log(
      result.success
        ? `Successfully applied ${rebasedLocalOps.length} operations on server`
        : `Failed to apply operations on server: ${result.errorMessage!}`
    );

    return result;
  } finally {
    await serverDb.destroy();
  }
}
