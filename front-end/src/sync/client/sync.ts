import type { MergedDB, SyncRequest, SyncResponse } from "@grocery-list/shared";
import { syncResponseSchema } from "@grocery-list/shared";
import type { Kysely } from "kysely";
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

  // Prepare the sync request
  const syncRequest = {
    localOperations: retrievedLocalOperations,
    expectedServerVersion: lastKnownServerVersion,
    clientMigrationState,
  } satisfies SyncRequest;

  // Get server URL from environment or use default
  // TODO: parse import.meta.env[`VITE_SERVER_URL`] as a string (if defined)
  const serverUrl =
    import.meta.env[`VITE_SERVER_URL`] ?? `http://localhost:3001`;

  console.log(`HTTP sync: sending request to ${serverUrl}/sync`);

  const response = await fetch(`${serverUrl}/sync`, {
    method: `POST`,
    headers: {
      "Content-Type": `application/json`,
    },
    body: JSON.stringify(syncRequest),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

    try {
      const errorBody = await response.text();
      if (errorBody !== ``) {
        errorMessage += ` - ${errorBody}`;
      }
    } catch {
      // Ignore errors when reading error response body
    }

    throw new Error(errorMessage);
  }

  // Parse and validate the response
  const responseData = await response.json();
  const validatedResponse = syncResponseSchema.parse(responseData);

  console.log(
    `HTTP sync: received response with status=${validatedResponse.status}`
  );
  return validatedResponse;
}
