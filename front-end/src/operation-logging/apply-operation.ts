import type { Kysely } from "kysely";
import type { DB } from "../../db";
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
