import type { MergedDB, SyncRequest, SyncResponse } from "@grocery-list/shared";
import {
  listExistsResponseSchema,
  syncResponseSchema,
} from "@grocery-list/shared";
import type { Kysely } from "kysely";
import { getLocalOperations } from "./get-local-operations";
import { getClientMigrationState } from "./migration-compatibility";
import { getLastKnownServerVersion } from "./state-tracking";

/**
 * Checks if a list exists on the server
 *
 * @param listId The ID of the list to check
 * @returns True if the list exists on the server, false otherwise
 */
export async function checkListExists(listId: string): Promise<boolean> {
  // Get server URL from environment or use default
  const serverUrl =
    import.meta.env[`VITE_SERVER_URL`] ?? `http://localhost:3001`;

  const existsEndpoint = `${serverUrl}/list/${listId}/exists`;
  console.log(`Checking list existence: ${existsEndpoint}`);

  const response = await fetch(existsEndpoint, {
    method: `GET`,
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
  const validatedResponse = listExistsResponseSchema.parse(responseData);

  console.log(`List exists check result: ${String(validatedResponse.exists)}`);
  return validatedResponse.exists;
}

/**
 * Combined sync function that handles migration compatibility checking, requesting remote changes, and submitting local changes
 * in a single network call. This implements the optimized sync algorithm that reduces round trips.
 *
 * This function automatically retrieves any local operations that need to be synced and checks migration compatibility.
 *
 * @param listId The ID of the list to sync
 * @param clientDb The client's database connection
 * @returns Response containing remote operations and status of submitted local operations
 */
export async function syncWithServer(
  listId: string,
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

  const syncEndpoint = `${serverUrl}/list/${listId}/sync`;
  console.log(`HTTP sync: sending request to ${syncEndpoint}`);

  const response = await fetch(syncEndpoint, {
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
