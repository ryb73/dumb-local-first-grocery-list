import { applyAndLogOperation } from "@grocery-list/shared";
import type { Operation } from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import { sql } from "kysely";
import { getServerDatabase } from "./database";
import {
  type MigrationState,
  getServerMigrationState,
} from "./migration-state";
import { getOperationsAfterVersionWithVersion } from "./operations";

/**
 * Response from the combined sync endpoint.
 * This is a discriminated union based on the sync status.
 */
export type SyncResponse =
  | {
      /** Status indicating local operations were accepted */
      status: "accepted";
      /** Current server version after processing */
      serverVersion: number | null;
      /** Commit timestamps for accepted operations (indexed by operation ID) */
      commitTimestamps: Map<string, number>;
    }
  | {
      /** Status indicating local operations were rejected due to conflicts */
      status: "rejected";
      /** Current server version */
      // TODO: is this needed?
      serverVersion: number;
      /** Remote operations that the client needs to apply */
      remoteOperations: Operation[];
      /** Optional error message explaining the rejection */
      errorMessage?: string;
    }
  | {
      /** Status indicating migration incompatibility */
      status: "migration_incompatible";
      /** The server's migration state */
      serverState: MigrationState;
      /** Human-readable error message */
      errorMessage: string;
    };

/**
 * Combined sync endpoint that handles migration compatibility checking, requesting remote changes, and submitting local changes.
 * This optimizes the sync process by reducing network round trips.
 *
 * First checks migration compatibility between client and server.
 * If migrations are incompatible, returns migration_incompatible status.
 *
 * If the client has local operations to submit:
 * - If there are remote changes that conflict, local operations are rejected and remote changes are returned
 * - If there are no conflicts, local operations are applied and empty remote operations are returned
 *
 * If the client has no local operations:
 * - Just returns any remote operations that need to be applied
 *
 * @param localOperations Local operations the client wants to submit (empty array if none)
 * @param expectedServerVersion The server version the client expects (for conflict detection)
 * @param clientMigrationState The client's migration state for compatibility checking
 * @returns Combined response with remote operations and status of local operations
 */
export async function sync(
  localOperations: Operation[],
  expectedServerVersion: number | null,
  clientMigrationState: MigrationState
): Promise<SyncResponse> {
  console.log(
    `Combined sync: ${
      localOperations.length
    } local operations, expected server version ${
      expectedServerVersion ?? `null`
    }`
  );

  // Step 0: Check migration compatibility
  const serverMigrationState = await getServerMigrationState();

  const mainCompatible =
    clientMigrationState.mainMigration === serverMigrationState.mainMigration;
  const opLogCompatible =
    clientMigrationState.operationLogMigration ===
    serverMigrationState.operationLogMigration;

  if (!mainCompatible || !opLogCompatible) {
    const messages: string[] = [];

    if (!mainCompatible) {
      messages.push(
        `Main database: client=${
          clientMigrationState.mainMigration ?? `none`
        }, server=${serverMigrationState.mainMigration ?? `none`}`
      );
    }

    if (!opLogCompatible) {
      messages.push(
        `Operation log: client=${
          clientMigrationState.operationLogMigration ?? `none`
        }, server=${serverMigrationState.operationLogMigration ?? `none`}`
      );
    }

    return {
      status: `migration_incompatible`,
      serverState: serverMigrationState,
      errorMessage: `Migration version mismatch. ${messages.join(`; `)}`,
    };
  }

  const serverDb = await getServerDatabase();

  try {
    // First, check if there are any remote operations the client needs
    const remoteResponse = await getOperationsAfterVersionWithVersion(
      expectedServerVersion
    );

    // If there are remote operations, reject any submitted local operations
    if (remoteResponse.operations.length > 0) {
      console.log(
        `Rejecting ${localOperations.length} local operations due to ${remoteResponse.operations.length} remote changes`
      );

      return {
        remoteOperations: remoteResponse.operations,
        serverVersion: defined(remoteResponse.serverVersion),
        status: `rejected`,
      };
    }

    // No remote operations, so we can try to apply local operations
    if (localOperations.length === 0) {
      console.log(`No local or remote operations to process`);

      return {
        commitTimestamps: new Map(),
        serverVersion: remoteResponse.serverVersion,
        status: `accepted`,
      };
    }

    // Apply local operations in a transaction
    const result = await serverDb.transaction().execute(async (trx) => {
      // Double-check server version within transaction for race conditions
      // TODO: I think the entire function should be wrapped in a single transaction so that this check isn't necessary.
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

      // Apply operations and log them with server timestamps
      const commitTimestamps = new Map<string, number>();

      for (const operation of localOperations) {
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

    if (!result.success) {
      return {
        status: `rejected`,
        errorMessage: result.errorMessage,
        remoteOperations: [],
        serverVersion: remoteResponse.serverVersion!,
      };
    }

    console.log(
      `Successfully applied ${localOperations.length} local operations on server`
    );

    // Get the new server version after applying operations
    const newVersionResult = await sql<{
      max_server_committed_at: number | null;
    }>`
      SELECT MAX(server_committed_at) as max_server_committed_at
      FROM op_log.operations
      WHERE server_committed_at IS NOT NULL
    `.execute(serverDb);

    const newServerVersion =
      newVersionResult.rows[0]?.max_server_committed_at ?? null;

    return {
      commitTimestamps: defined(result.commitTimestamps),
      serverVersion: newServerVersion,
      status: `accepted`,
    };
  } finally {
    await serverDb.destroy();
  }
}
