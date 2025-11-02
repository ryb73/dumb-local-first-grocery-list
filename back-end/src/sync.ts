import { applyAndLogOperation } from "@grocery-list/shared";
import type {
  MigrationState,
  Operation,
  SyncResponse,
} from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks.js";
import { getServerDatabase } from "./database/connection.js";
import { getServerMigrationState } from "./migration-state.js";
import {
  getCurrentServerVersion,
  getOperationsAfterVersionWithVersion,
} from "./operations.js";

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
 * @param listId UUID of the list to sync
 * @param localOperations Local operations the client wants to submit (empty array if none)
 * @param expectedServerVersion The server version the client expects (for conflict detection)
 * @param clientMigrationState The client's migration state for compatibility checking
 * @returns Combined response with remote operations and status of local operations
 */
export async function sync(
  listId: string,
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

  const serverDb = await getServerDatabase(listId, {
    // I'm getting weird behavior where my databases seem to be getting emptied out.
    // I don't know why it is, but maybe this will help short circuit if the database doesn't exist when it should?
    fileMustExist: expectedServerVersion != null,
  });

  if (serverDb == null) {
    return {
      status: `rejected`,
      serverVersion: null,
      errorMessage: `Server database does not exist`,
      remoteOperations: [],
    };
  }

  try {
    return await serverDb
      .transaction()
      .execute(async (trx): Promise<SyncResponse> => {
        // Step 0: Check migration compatibility
        const serverMigrationState = await getServerMigrationState(trx);

        const mainCompatible =
          clientMigrationState.mainMigration ===
          serverMigrationState.mainMigration;
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

        // First, check if there are any remote operations the client needs
        const remoteResponse = await getOperationsAfterVersionWithVersion(
          trx,
          expectedServerVersion
        );
        console.log(
          `Got ${
            remoteResponse.operations.length
          } remote operations, server version ${
            remoteResponse.serverVersion ?? `null`
          }`
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
            commitTimestamps: {},
            serverVersion: remoteResponse.serverVersion,
            status: `accepted`,
          };
        }

        // There are no remote operatons to send back. Before accepting the pushed operations,
        // make sure the server version is what we expect.
        if (remoteResponse.serverVersion !== expectedServerVersion) {
          return {
            status: `rejected`,
            serverVersion: remoteResponse.serverVersion,
            errorMessage: `Version mismatch: expected ${
              expectedServerVersion ?? `null`
            }, current ${remoteResponse.serverVersion ?? `null`}.`,
            remoteOperations: [],
          };
        }

        // Apply operations and log them with server timestamps
        const commitTimestamps: Record<string, number> = {};

        for (const operation of localOperations) {
          // Generate commit timestamp for this operation
          const commitTimestamp = Date.now();
          commitTimestamps[operation.id] = commitTimestamp;

          // Apply the operation and log it with the server commit timestamp
          const operationWithServerTimestamp = {
            ...operation,
            serverCommittedAt: commitTimestamp,
          };
          await applyAndLogOperation(trx, operationWithServerTimestamp);
        }

        console.log(
          `Successfully applied ${localOperations.length} local operations on server`
        );

        // Get the new server version after applying operations
        const newServerVersion = await getCurrentServerVersion(trx);

        return {
          commitTimestamps,
          serverVersion: newServerVersion,
          status: `accepted`,
        };
      });
  } finally {
    await serverDb.destroy();
  }
}
