import type { Kysely } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import type { Operation } from "../../operation-logging/operation-types";
import { getOperationsAfterVersionWithVersion } from "../server/operations";
import { getLastKnownServerVersion } from "./state-tracking";

/**
 * Response from requesting changes from the server.
 */
export type ServerChangesResponse = {
  /** Remote operations from the server */
  operations: Operation[];
  /** Current server version identifier (latest server_committed_at timestamp) */
  serverVersion: number | null;
};

/**
 * Requests changes from the server that were applied after the last known server version.
 * This implements step 1 of the sync algorithm from PRIMARY.md.
 *
 * @param clientDb The client's database connection
 * @returns Remote operations from the server and current server version
 */
export async function requestChangesFromServer(
  clientDb: Kysely<MergedDB>
): Promise<ServerChangesResponse> {
  // Get the last known server version from the client's perspective
  const lastKnownServerVersion = await getLastKnownServerVersion(clientDb);

  return await getOperationsAfterVersionWithVersion(lastKnownServerVersion);
}
