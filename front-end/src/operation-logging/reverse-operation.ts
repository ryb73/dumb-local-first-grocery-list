import type { Kysely, Transaction } from "kysely";
import type { DB } from "../../db";
import type { MergedDB } from "../db/merged-db";
import type { Operation } from "./operation-types.ts";

/**
 * NOTE: This file explicitly writes out object keys instead of using spread operators
 * to avoid the possibility of unwanted values being set in database operations.
 * Future editors should maintain this pattern for safety and explicitness.
 */

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
        .set({ name: operation.payload.originalItem.name })
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

    case `createItem`: {
      // To reverse createItem, we delete the created item
      await db
        .deleteFrom(`items`)
        .where(`id`, `=`, operation.payload.item.id)
        .execute();
      break;
    }

    case `deleteItem`: {
      // To reverse deleteItem, we recreate the deleted item
      const deletedItem = operation.payload.deletedItem;
      await db
        .insertInto(`items`)
        .values({
          checked: deletedItem.checked ? 1 : 0,
          created_at: deletedItem.createdAt,
          id: operation.payload.itemId,
          last_checked_at: deletedItem.lastCheckedAt,
          name: deletedItem.name,
        })
        .execute();
      break;
    }

    default: {
      throw new Error(
        `Unsupported operation type: ${JSON.stringify(operation)}`
      );
    }
  }
}

async function reverseOperationMergedDB(
  db: Kysely<MergedDB>,
  operation: Operation
) {
  await reverseOperation(db as unknown as Kysely<DB>, operation);
}

/**
 * Reverses an operation and removes it from the operation log within a transaction.
 * This ensures atomicity between undoing the operation and removing it from the log.
 *
 * @param trx The transaction to execute within
 * @param operation The operation to reverse and remove from the log
 */
export async function reverseAndRemoveOperation(
  trx: Transaction<MergedDB>,
  operation: Operation
): Promise<void> {
  // Reverse the operation in the main database
  await reverseOperationMergedDB(trx, operation);

  // Remove the operation from the operation log
  await trx
    .deleteFrom(`op_log.operations`)
    .where(`id`, `=`, operation.id)
    .execute();
}
