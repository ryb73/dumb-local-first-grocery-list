import { randomUUID } from "crypto";
import type { Operation } from "./operation-types";

function areNamesEqual(a: string, b: string) {
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
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
  localOp: Operation
): Operation[] {
  switch (remoteOp.type) {
    case `createItem`: {
      switch (localOp.type) {
        case `createItem`: {
          if (
            areNamesEqual(localOp.payload.item.name, remoteOp.payload.item.name)
          ) {
            return [];
          }
          return [localOp];
        }
        case `renameItem`: {
          if (
            !areNamesEqual(localOp.payload.newName, remoteOp.payload.item.name)
          ) {
            return [localOp];
          }

          return [
            {
              clientCreatedAt: localOp.clientCreatedAt,
              id: randomUUID(),
              payload: {
                deletedItem: {
                  checked: 0,
                  created_at: remoteOp.payload.item.created_at,
                  last_unchecked_at: null,
                  name: remoteOp.payload.item.name,
                },
                itemId: remoteOp.payload.item.id,
              },
              serverCommittedAt: null,
              type: `deleteItem`,
            },
          ];
        }
        case `setItemChecked`:
        case `setItemUnchecked`:
        case `deleteItem`: {
          // A remote item was created. A local operation modified a different item.
          // These are independent operations on different items and cannot conflict.
          return [localOp];
        }
      }
      throw new Error(
        `Unhandled local operation type: ${(localOp as Operation).type}`
      );
    }

    case `renameItem`: {
      switch (localOp.type) {
        case `createItem`: {
          return areNamesEqual(
            localOp.payload.item.name,
            remoteOp.payload.newName
          )
            ? []
            : [localOp];
        }

        case `renameItem`: {
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Both ops rename the same item. Keep whichever is newer.
            return remoteOp.clientCreatedAt > localOp.clientCreatedAt
              ? [localOp]
              : [];
          }

          if (
            areNamesEqual(localOp.payload.newName, remoteOp.payload.newName)
          ) {
            // Both renaming to the same name. Keep the item renamed by the remote op,
            // delete the item renamed by the local op.
            throw new Error(`Not implemented yet`);
          }
          return [localOp];
        }
        case `deleteItem`:
        case `setItemChecked`:
        case `setItemUnchecked`: {
          // Remote renamed an item, local op modified an item.
          // If it's the same item, the local op is still valid as it's by ID.
          // No conflict.
          return [localOp];
        }
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }

    case `setItemChecked`: {
      switch (localOp.type) {
        case `setItemChecked`:
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Both checking the same item. The operation is idempotent,
            // so the local operation is redundant.
            return [];
          }
          return [localOp];

        case `createItem`:
        case `renameItem`:
        case `setItemUnchecked`:
        case `deleteItem`:
          // These operations don't conflict with a remote setItemChecked
          // or local "wins" in case of a direct conflict.
          return [localOp];
      }
      throw new Error(
        `Unhandled local operation type: ${
          (localOp as Operation).type
        } for remote operation type: ${remoteOp.type}`
      );
    }

    case `setItemUnchecked`: {
      switch (localOp.type) {
        case `setItemUnchecked`:
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Both unchecking the same item. Operation is idempotent.
            return [];
          }
          return [localOp];

        case `createItem`:
        case `renameItem`:
        case `setItemChecked`:
        case `deleteItem`:
          // These operations don't conflict with a remote setItemUnchecked
          // or local "wins" in case of a direct conflict.
          return [localOp];
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
          return [localOp];
        case `renameItem`:
        case `setItemChecked`:
        case `setItemUnchecked`:
        case `deleteItem`:
          if (remoteOp.payload.itemId === localOp.payload.itemId) {
            // Remote deleted an item that was modified or deleted locally.
            // The item is gone, so the local operation is invalid or redundant.
            return [];
          }
          return [localOp];
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
