import type { Kysely } from "kysely";
import type { DB } from "../../db";
import type { Operation } from "./operation-types.ts";

/**
 * Reverses an operation that has already been applied to the database.
 * This function directly mutates the database to undo the effect of the original operation.
 *
 * @param db The Kysely database instance.
 * @param operation The operation to reverse.
 */
export async function reverseOperation(
  db: Kysely<DB>,
  operation: Operation
): Promise<void> {
  switch (operation.type) {
    case `renameItem`: {
      await db
        .updateTable(`items`)
        .set({ name: operation.payload.originalName })
        .where(`id`, `=`, operation.payload.itemId)
        .execute();
      break;
    }

    case `setCheckedState`: {
      await db
        .updateTable(`items`)
        .set({
          checked: operation.payload.originalChecked ? 1 : 0,
          last_checked_at: operation.payload.originalLastCheckedAt,
        })
        .where(`id`, `=`, operation.payload.itemId)
        .execute();
      break;
    }

    case `createItem`:
    case `deleteItem`:
      throw new Error(`Not yet implemented: ${operation.type}`);

    default: {
      throw new Error(
        `Unsupported operation type: ${JSON.stringify(operation)}`
      );
    }
  }
}
