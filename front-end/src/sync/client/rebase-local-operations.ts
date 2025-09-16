import type { Operation, RebaseContext } from "@grocery-list/shared";
import { rebase, resolveConflict } from "@grocery-list/shared";

/**
 * Implementation of step 3: Client builds rebased local operations list.
 *
 * This implements step 3 of the sync algorithm from PRIMARY.md:
 * "Build Rebased Local Operations List (rebasedLocalOps): The client transforms its
 * localOps based on the server's remoteOps to produce a new list of changes to be
 * reapplied (rebasedLocalOps)."
 *
 * This uses the full rebase algorithm with conflict resolution to transform
 * local operations as if they were made after the remote operations.
 *
 * @param localOps Local operations that were unwound
 * @param remoteOps Remote operations from the server
 * @returns Rebased local operations that can be safely applied after remote operations
 */
export function rebaseLocalOperations(
  localOps: Operation[],
  remoteOps: Operation[]
): Operation[] {
  console.log(
    `Step 3: Rebasing ${localOps.length} local operations against ${remoteOps.length} remote operations`
  );

  // Initialize empty context for ID mapping during conflict resolution
  const initialContext: RebaseContext = {
    newEffectiveIdsByOldId: new Map(),
  };

  // Use the generic rebase function with our conflict resolution logic
  const rebasedOps = rebase(
    localOps,
    remoteOps,
    resolveConflict,
    initialContext
  );

  console.log(
    `Rebase completed: ${rebasedOps.length} operations after transformation`
  );
  console.log(`Rebased operations:`, rebasedOps);

  return rebasedOps;
}
