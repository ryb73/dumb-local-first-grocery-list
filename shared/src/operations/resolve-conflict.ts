import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks.js";
import type { Operation } from "./operation-types.js";

function areNamesEqual(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

export type RebaseContext = { newEffectiveIdsByOldId: Map<string, string> };

/**
 * Transforms the itemId in the local operation to the new effective itemId
 * based on the context.
 * @param localOp - The local operation to transform
 * @param context - The context containing the new effective ids by old id
 * @returns The transformed local operation or null if the itemId is not in the context
 */
function transformOldIdsToNew(
  localOp: Operation,
  context: RebaseContext
): Operation | null {
  switch (localOp.type) {
    case `createItem`: {
      return null;
    }
    case `deleteItem`: {
      // Skip ID mapping if noIdMap flag is set
      if (localOp.payload.noIdMap === true) {
        return null;
      }

      if (!context.newEffectiveIdsByOldId.has(localOp.payload.itemId)) {
        return null;
      }

      return {
        ...localOp,
        payload: {
          ...localOp.payload,
          itemId: defined(
            context.newEffectiveIdsByOldId.get(localOp.payload.itemId)
          ),
        },
      };
    }
    case `renameItem`: {
      if (!context.newEffectiveIdsByOldId.has(localOp.payload.itemId)) {
        return null;
      }

      return {
        ...localOp,
        payload: {
          ...localOp.payload,
          itemId: defined(
            context.newEffectiveIdsByOldId.get(localOp.payload.itemId)
          ),
        },
      };
    }
    // eslint-disable-next-line sonarjs/no-duplicated-branches
    case `setCheckedState`: {
      if (!context.newEffectiveIdsByOldId.has(localOp.payload.itemId)) {
        return null;
      }

      return {
        ...localOp,
        payload: {
          ...localOp.payload,
          itemId: defined(
            context.newEffectiveIdsByOldId.get(localOp.payload.itemId)
          ),
        },
      };
    }
    case `setListName`: {
      // setListName doesn't reference item IDs, so no transformation needed
      return null;
    }
  }

  throw new Error(
    `Unhandled local operation type: ${(localOp as Operation).type}`
  );
}

/**
 * Core conflict resolution function that determines how a local operation should be transformed
 * given a remote operation that was applied first.
 *
 * @param remoteOp - The operation that was applied on the server
 * @param localOp - The local operation that needs to be potentially transformed
 * @returns An array of operations representing how localOp should be transformed:
 *   - `[...localOp']`: The localOp is modified to localOp'
 *   - `[localOp]`: The localOp is unaffected and should be kept as is
 *   - `[]`: The localOp should be discarded (redundant or conflicts with remoteOp)
 */
export function resolveConflict(
  remoteOp: Operation,
  localOp: Operation,
  context: RebaseContext
): { transformedOps: Operation[]; newContext: RebaseContext } {
  const localOpWithTransformedId = transformOldIdsToNew(localOp, context);
  if (localOpWithTransformedId != null)
    return resolveConflict(remoteOp, localOpWithTransformedId, context);

  switch (remoteOp.type) {
    case `createItem`: {
      switch (localOp.type) {
        case `createItem`: {
          if (
            areNamesEqual(localOp.payload.item.name, remoteOp.payload.item.name)
          ) {
            const newContext = {
              ...context,
              newEffectiveIdsByOldId: new Map(context.newEffectiveIdsByOldId),
            };
            newContext.newEffectiveIdsByOldId.set(
              localOp.payload.item.id,
              remoteOp.payload.item.id
            );
            return { transformedOps: [], newContext };
          }
          return {
            transformedOps: [localOp],
            newContext: context,
          };
        }
        case `renameItem`: {
          // If the ID is the same, then we need to make sure that `originalItem` matches because
          // the ID may have come from the newEffectiveIdsByOldId map – in other words, it may be a
          // merged/redirected item.
          if (localOp.payload.itemId === remoteOp.payload.item.id) {
            return {
              transformedOps: [
                {
                  ...localOp,
                  payload: {
                    ...localOp.payload,
                    itemId: remoteOp.payload.item.id,
                    originalItem: {
                      checked: false,
                      createdAt: remoteOp.payload.item.createdAt,
                      lastCheckedAt: null,
                      name: remoteOp.payload.item.name,
                    },
                  },
                },
              ],
              newContext: context,
            };
          }

          if (
            !areNamesEqual(localOp.payload.newName, remoteOp.payload.item.name)
          ) {
            return {
              transformedOps: [localOp],
              newContext: context,
            };
          }

          // Local item is being renamed to the same name as a remotely created item.
          // This represents a merge conflict: both sides want an item with the same name.
          // Resolution strategy: Keep the remote item, delete the local item, and redirect
          // all future references to the local item ID to use the remote item ID instead.
          const newContext = {
            ...context,
            newEffectiveIdsByOldId: new Map(context.newEffectiveIdsByOldId),
          };
          newContext.newEffectiveIdsByOldId.set(
            localOp.payload.itemId,
            remoteOp.payload.item.id
          );

          return {
            transformedOps: [
              {
                clientCreatedAt: localOp.clientCreatedAt,
                id: crypto.randomUUID(),
                payload: {
                  // Delete the LOCAL item (the one being renamed), not the remote item.
                  // This preserves the remote item and any subsequent operations on it.
                  deletedItem: localOp.payload.originalItem,
                  itemId: localOp.payload.itemId,
                  // Prevent ID mapping to ensure we delete the local item, not the merged remote item
                  noIdMap: true,
                },
                serverCommittedAt: null,
                type: `deleteItem`,
              },
            ],
            newContext,
          };
        }
        case `setCheckedState`:
        case `deleteItem`:
        case `setListName`: {
          // A remote item was created. A local operation modified a different item or list metadata.
          // These are independent operations and cannot conflict.
          return {
            transformedOps: [localOp],
            newContext: context,
          };
        }
      }
      throw new Error(
        `Unhandled local operation type: ${(localOp as Operation).type}`
      );
    }

    case `renameItem`: {
      switch (localOp.type) {
        case `createItem`: {
          if (
            !areNamesEqual(localOp.payload.item.name, remoteOp.payload.newName)
          ) {
            return { transformedOps: [localOp], newContext: context };
          }

          const newContext = {
            ...context,
            newEffectiveIdsByOldId: new Map(context.newEffectiveIdsByOldId),
          };
          newContext.newEffectiveIdsByOldId.set(
            localOp.payload.item.id,
            remoteOp.payload.itemId
          );

          return { transformedOps: [], newContext };
        }

        case `renameItem`: {
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Both ops rename the same item. Use Last-Writer-Wins (LWW).
            if (localOp.clientCreatedAt <= remoteOp.clientCreatedAt) {
              // Remote is newer or same, so local is discarded.
              return { transformedOps: [], newContext: context };
            }

            // Local is newer, it "wins", but must be transformed.
            return {
              transformedOps: [
                {
                  ...localOp,
                  payload: {
                    ...localOp.payload,
                    originalItem: {
                      ...localOp.payload.originalItem,
                      name: remoteOp.payload.newName,
                    },
                  },
                },
              ],
              newContext: context,
            };
          }

          if (
            areNamesEqual(localOp.payload.newName, remoteOp.payload.newName)
          ) {
            // Both renaming to the same name. Keep the item renamed by the remote op,
            // delete the item renamed by the local op.

            const { originalItem } = localOp.payload;

            return {
              transformedOps: [
                {
                  clientCreatedAt: localOp.clientCreatedAt,
                  id: crypto.randomUUID(),
                  payload: {
                    deletedItem: {
                      checked: originalItem.checked,
                      createdAt: originalItem.createdAt,
                      lastCheckedAt: originalItem.lastCheckedAt,
                      name: originalItem.name,
                    },
                    itemId: localOp.payload.itemId,
                  },
                  serverCommittedAt: null,
                  type: `deleteItem`,
                },
              ],
              newContext: context,
            };
          }
          return { transformedOps: [localOp], newContext: context };
        }
        case `deleteItem`: {
          if (remoteOp.payload.itemId !== localOp.payload.itemId) {
            return { transformedOps: [localOp], newContext: context };
          }

          return {
            transformedOps: [
              {
                ...localOp,
                payload: {
                  ...localOp.payload,
                  deletedItem: {
                    ...localOp.payload.deletedItem,
                    name: remoteOp.payload.newName,
                  },
                },
              },
            ],
            newContext: context,
          };
        }
        case `setCheckedState`:
        case `setListName`: {
          // Remote renamed an item, local op modified an item or list metadata.
          // If it's the same item, the local op is still valid as it's by ID.
          // No conflict.
          return { transformedOps: [localOp], newContext: context };
        }
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }

    case `setCheckedState`: {
      switch (localOp.type) {
        // Create, Rename, Delete, and SetListName operations are orthogonal or take precedence.
        case `createItem`:
        case `setListName`:
          return { transformedOps: [localOp], newContext: context };
        case `deleteItem`: {
          if (remoteOp.payload.itemId !== localOp.payload.itemId) {
            return { transformedOps: [localOp], newContext: context };
          }

          const newDeletedItem = { ...localOp.payload.deletedItem };
          newDeletedItem.checked = remoteOp.payload.checked;
          if (remoteOp.payload.checked) {
            newDeletedItem.lastCheckedAt = remoteOp.payload.newLastCheckedAt;
          }

          return {
            transformedOps: [
              {
                ...localOp,
                payload: {
                  ...localOp.payload,
                  deletedItem: newDeletedItem,
                },
              },
            ],
            newContext: context,
          };
        }

        case `renameItem`: {
          if (remoteOp.payload.itemId !== localOp.payload.itemId)
            return { transformedOps: [localOp], newContext: context };

          return {
            transformedOps: [
              {
                ...localOp,
                payload: {
                  ...localOp.payload,
                  originalItem: {
                    ...localOp.payload.originalItem,
                    checked: remoteOp.payload.checked,
                    lastCheckedAt: remoteOp.payload.checked
                      ? remoteOp.payload.newLastCheckedAt
                      : null,
                  },
                },
              },
            ],
            newContext: context,
          };
        }

        case `setCheckedState`: {
          // If the operations are on different items, they don't conflict.
          if (remoteOp.payload.itemId !== localOp.payload.itemId) {
            return { transformedOps: [localOp], newContext: context };
          }

          // Both operations are on the same item. Use Last-Writer-Wins (LWW)
          // based on the client's creation timestamp.
          if (localOp.clientCreatedAt <= remoteOp.clientCreatedAt) {
            // Remote operation is newer or simultaneous, local operation is discarded.
            return { transformedOps: [], newContext: context };
          }

          // Local operation is newer, it "wins". However, we must transform it
          // so its "original" state reflects the state *after* the remote
          // operation has been applied. This ensures the operation is valid
          // in the new context.
          const transformedPayload = {
            ...localOp.payload,
            // The new "original" checked state for the local op is whatever
            // the remote op set it to.
            originalChecked: remoteOp.payload.checked,
            originalLastCheckedAt: remoteOp.payload.checked
              ? remoteOp.payload.newLastCheckedAt
              : // If remote op unchecked, last_checked_at is preserved from *its* original state.
                remoteOp.payload.originalLastCheckedAt,
          };

          return {
            transformedOps: [{ ...localOp, payload: transformedPayload }],
            newContext: context,
          };
        }
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }
    case `deleteItem`: {
      switch (localOp.type) {
        case `createItem`:
        case `setListName`:
          // Cannot conflict.
          return { transformedOps: [localOp], newContext: context };
        case `renameItem`:
        case `setCheckedState`:
        case `deleteItem`:
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Remote deleted an item that was modified or deleted locally.
            // The item is gone, so the local operation is invalid or redundant.
            return { transformedOps: [], newContext: context };
          }
          return { transformedOps: [localOp], newContext: context };
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }

    case `setListName`: {
      switch (localOp.type) {
        case `createItem`:
        case `renameItem`:
        case `setCheckedState`:
        case `deleteItem`:
          // Remote changed list metadata, local op modified an item.
          // These are independent operations and cannot conflict.
          return { transformedOps: [localOp], newContext: context };

        case `setListName`: {
          // Both operations change the list name. Use Last-Writer-Wins (LWW).
          if (localOp.clientCreatedAt <= remoteOp.clientCreatedAt) {
            // Remote is newer or same, so local is discarded.
            return { transformedOps: [], newContext: context };
          }

          // Local is newer, it "wins", but must be transformed.
          // Update originalName to reflect the state after the remote operation.
          return {
            transformedOps: [
              {
                ...localOp,
                payload: {
                  ...localOp.payload,
                  originalName: remoteOp.payload.newName,
                },
              },
            ],
            newContext: context,
          };
        }
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }
  }
  throw new Error(
    `Unhandled remote operation type: ${(remoteOp as Operation).type}`
  );
}
