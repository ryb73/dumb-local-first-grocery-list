import type { Operation } from "../../operation-logging/operation-types";
import { applyClientChanges } from "../server/apply-client-changes";

/**
 * Submits rebased changes to the server.
 * This implements step 5 of the sync algorithm from PRIMARY.md:
 * "Client Submits Rebased Changes: The client submits rebasedLocalOps to the server."
 *
 * @param rebasedLocalOps The rebased local operations to submit
 * @param expectedServerVersion The server version that was used during rebasing (for optimistic locking)
 * @returns Response indicating success/failure and commit timestamps
 */
export async function submitChangesToServer(
  rebasedLocalOps: Operation[],
  expectedServerVersion: number | null
) {
  console.log(
    `Step 5: Submitting ${
      rebasedLocalOps.length
    } rebased operations to server with expected version ${
      expectedServerVersion ?? `null`
    }`
  );

  return await applyClientChanges(rebasedLocalOps, expectedServerVersion);
}
