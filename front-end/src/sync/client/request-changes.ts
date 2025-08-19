import type { Kysely } from "kysely";
import type { MergedDB } from "../../db/merged-db";
import { getOperationsAfterVersion } from "../server/operations";
import { getLastKnownServerVersion } from "./state-tracking";

/**
 * Requests changes from the server that were applied after the last known server version.
 * This implements step 1 of the sync algorithm from PRIMARY.md.
 *
 * @param clientDb The client's database connection
 * @returns Remote operations from the server
 */
export async function requestChangesFromServer(clientDb: Kysely<MergedDB>) {
  // Get the last known server version from the client's perspective
  const lastKnownServerVersion = await getLastKnownServerVersion(clientDb);

  return await getOperationsAfterVersion(lastKnownServerVersion);
}
