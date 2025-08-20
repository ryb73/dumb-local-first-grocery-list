import type { Kysely, Transaction } from "kysely";
import type { DB } from "../../db";
import type { MergedDB } from "../db/merged-db";
import type { Operation } from "./operation-types.ts";

/**
 * NOTE: This file explicitly writes out object keys instead of using spread operators
 * to avoid the possibility of unwanted values being set in database operations.
 * Future editors should maintain this pattern for safety and explicitness.
 */

export async function applyOperation(
  db: Kysely<DB>,
  operation: Operation
): Promise<void> {
  switch (operation.type) {
    case `renameItem`: {
      await db
        .updateTable(`items`)
        .set({ name: operation.payload.newName })
        .where(`id`, `=`, operation.payload.itemId)
        .execute();
      break;
    }
    case `setCheckedState`: {
      await db
        .updateTable(`items`)
        .set(
          operation.payload.checked
            ? {
                checked: 1,
                last_checked_at: operation.payload.newLastCheckedAt,
              }
            : { checked: 0 }
        )
        .where(`id`, `=`, operation.payload.itemId)
        .execute();
      break;
    }
    case `createItem`: {
      await db
        .insertInto(`items`)
        .values({
          checked: 0,
          created_at: operation.payload.item.createdAt,
          id: operation.payload.item.id,
          last_checked_at: null,
          name: operation.payload.item.name,
        })
        .execute();
      break;
    }
    case `deleteItem`: {
      await db
        .deleteFrom(`items`)
        .where(`id`, `=`, operation.payload.itemId)
        .execute();
      break;
    }
  }
}

/**
 * Applies an operation to a MergedDB database.
 * This function delegates to the main applyOperation function by casting the database type.
 *
 * @param db The Kysely MergedDB database instance.
 * @param operation The operation to apply.
 */
export async function applyOperationMergedDB(
  db: Kysely<MergedDB>,
  operation: Operation
): Promise<void> {
  await applyOperation(db as unknown as Kysely<DB>, operation);
}

/**
 * Applies an operation to the database and logs it to the operation log within a transaction.
 * This ensures atomicity between the main database update and operation log update.
 *
 * @param trx The transaction to execute within
 * @param operation The operation to apply and log
 */
export async function applyAndLogOperation(
  trx: Transaction<MergedDB>,
  operation: Operation
): Promise<void> {
  // Apply the operation to the main database
  await applyOperationMergedDB(trx, operation);

  // Log the operation to the operation log
  await trx
    .insertInto(`op_log.operations`)
    .values({
      client_created_at: operation.clientCreatedAt,
      id: operation.id,
      payload: JSON.stringify(operation.payload),
      server_committed_at: operation.serverCommittedAt,
      type: operation.type,
    })
    .execute();
}
