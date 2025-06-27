import type { Kysely } from "kysely";
import type { DB } from "../../db";
import type { Operation } from "./operation-types.ts";

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
    case `createItem`:
      // Not yet implemented
      break;
    case `deleteItem`:
      // Not yet implemented
      break;
  }
}
