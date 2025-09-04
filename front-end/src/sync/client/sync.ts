import type { Kysely } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import { type SyncResponse, sync as serverSync } from "../server/sync";
import { getLocalOperations } from "./get-local-operations";
import { getLastKnownServerVersion } from "./state-tracking";

/**
 * Combined sync function that handles both requesting remote changes and submitting local changes
 * in a single network call. This implements the optimized sync algorithm that reduces round trips.
 *
 * This function automatically retrieves any local operations that need to be synced.
 *
 * @param clientDb The client's database connection
 * @returns Response containing remote operations and status of submitted local operations
 */
export async function syncWithServer(
  clientDb: Kysely<MergedDB>
): Promise<SyncResponse> {
  // Get the last known server version and local operations in parallel
  const [lastKnownServerVersion, retrievedLocalOperations] = await Promise.all([
    getLastKnownServerVersion(clientDb),
    getLocalOperations(clientDb),
  ]);

  console.log(
    `Client sync: submitting ${
      retrievedLocalOperations.length
    } local operations with expected server version ${
      lastKnownServerVersion ?? `null`
    }`
  );

  // Call the combined sync endpoint
  return await serverSync(retrievedLocalOperations, lastKnownServerVersion);
}
