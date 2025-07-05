import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Operation } from "./operation-types";

function areNamesEqual(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

type Context = { newEffectiveIdsByOldId: Map<string, string> };

/**
 * Transforms the itemId in the local operation to the new effective itemId
 * based on the context.
 * @param localOp - The local operation to transform
 * @param context - The context containing the new effective ids by old id
 * @returns The transformed local operation or null if the itemId is not in the context
 */
function transformOldIdsToNew(
  localOp: Operation,
  context: Context
): Operation | null {
  switch (localOp.type) {
    case `createItem`: {
      return null;
    }
    case `deleteItem`: {
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
  context: Context
): { transformedOps: Operation[]; newContext: Context } {
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
                      checked: 0,
                      created_at: remoteOp.payload.item.created_at,
                      last_checked_at: null,
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
                  deletedItem: {
                    checked: 0,
                    created_at: remoteOp.payload.item.created_at,
                    last_checked_at: null,
                    name: remoteOp.payload.item.name,
                  },
                  itemId: remoteOp.payload.item.id,
                },
                serverCommittedAt: null,
                type: `deleteItem`,
              },
            ],
            newContext,
          };
        }
        case `setCheckedState`:
        case `deleteItem`: {
          // A remote item was created. A local operation modified a different item.
          // These are independent operations on different items and cannot conflict.
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
                      created_at: originalItem.created_at,
                      last_checked_at: originalItem.last_checked_at,
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
        case `deleteItem`:
        case `setCheckedState`: {
          // Remote renamed an item, local op modified an item.
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
        // Create, Rename, and Delete operations are orthogonal or take precedence.
        case `createItem`:
        case `renameItem`:
        case `deleteItem`:
          return { transformedOps: [localOp], newContext: context };

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
          };

          // If both operations are setting `checked: true`, then the local
          // operation is effectively a no-op. We need to update the
          // last checked fields so that they match the remote op.
          if (transformedPayload.checked && remoteOp.payload.checked) {
            transformedPayload.originalLastCheckedAt =
              remoteOp.payload.originalLastCheckedAt;
            transformedPayload.newLastCheckedAt =
              remoteOp.payload.newLastCheckedAt;
          }

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
  }
  throw new Error(
    `Unhandled remote operation type: ${(remoteOp as Operation).type}`
  );
}
