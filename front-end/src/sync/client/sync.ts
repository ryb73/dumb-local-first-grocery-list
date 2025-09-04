import type { Kysely } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import { type SyncResponse, sync as serverSync } from "../server/sync";
import { getLocalOperations } from "./get-local-operations";
import { getClientMigrationState } from "./migration-compatibility";
import { getLastKnownServerVersion } from "./state-tracking";

/**
 * Combined sync function that handles migration compatibility checking, requesting remote changes, and submitting local changes
 * in a single network call. This implements the optimized sync algorithm that reduces round trips.
 *
 * This function automatically retrieves any local operations that need to be synced and checks migration compatibility.
 *
 * @param clientDb The client's database connection
 * @returns Response containing remote operations and status of submitted local operations
 */
export async function syncWithServer(
  clientDb: Kysely<MergedDB>
): Promise<SyncResponse> {
  // Get the last known server version, local operations, and client migration state
  const lastKnownServerVersion = await getLastKnownServerVersion(clientDb);
  const retrievedLocalOperations = await getLocalOperations(clientDb);
  const clientMigrationState = await getClientMigrationState(clientDb);

  console.log(
    `Client sync: submitting ${
      retrievedLocalOperations.length
    } local operations with expected server version ${
      lastKnownServerVersion ?? `null`
    }`
  );

  // Call the combined sync endpoint
  return await serverSync(
    retrievedLocalOperations,
    lastKnownServerVersion,
    clientMigrationState
  );
}
