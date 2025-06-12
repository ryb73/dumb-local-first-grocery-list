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

        case `setItemChecked`: {
          throw new Error(`Not implemented yet: "setItemChecked" case`);
        }

        case `setItemUnchecked`: {
          throw new Error(`Not implemented yet: "setItemUnchecked" case`);
        }

        case `deleteItem`: {
          throw new Error(`Not implemented yet: "deleteItem" case`);
        }
      }
      throw new Error(
        `Unhandled operation type: ${(localOp as Operation).type}`
      );
    }

    case `renameItem`: {
      throw new Error(`Not implemented yet: "renameItem" case`);
    }

    case `setItemChecked`: {
      throw new Error(`Not implemented yet: "setItemChecked" case`);
    }

    case `setItemUnchecked`: {
      throw new Error(`Not implemented yet: "setItemUnchecked" case`);
    }
    case `deleteItem`: {
      throw new Error(`Not implemented yet: "deleteItem" case`);
    }
  }
  throw new Error(`Unhandled operation type: ${(remoteOp as Operation).type}`);
}
