import type { Item, ItemUpdate } from "../types/schemas";

/**
 * Represents the unique identifier for a migration.
 */
export type MigrationId = string;

/**
 * A generic base for all operations.
 * This structure aligns with the `operations` table in `groceries.log.sqlite3`.
 */
type BaseOperation<T extends string, P> = {
  /** Unique ID for this specific operation instance. */
  id: string;
  /** The type of operation. */
  type: T;
  /** Timestamp (UTC ms since epoch) when the operation was created on the client. */
  clientCreatedAt: number;
  /** Timestamp (UTC ms since epoch) when the operation was committed to the server, or null if not yet committed. */
  serverCommittedAt: number | null;
  /** The payload of the operation, containing all necessary details to apply or reverse the operation. */
  payload: P;
};

// --- Item Operations ---

/**
 * Operation for when a new item is definitively inserted.
 * This corresponds to the case in `Database.addItem` where `existingRow` is null.
 */
export type CreateItemPayload = { item: Item };
export type CreateItemOperation = BaseOperation<
  "createItem",
  CreateItemPayload
>;

/**
 * Operation for updating an existing item.
 * This can be used by `Database.toggleItem` and the case in `Database.addItem`
 * where `existingRow` is found (which then updates the 'checked' status).
 * It can also be used by the general `Database.updateItem`.
 */
export type UpdateItemPayload = {
  id: Item["id"];
  /** The changes applied to the item. Only includes fields that were changed. */
  changes: Omit<ItemUpdate, "id">;
  /** The original values of the fields that were changed. Necessary for rollbacks/conflict resolution. */
  originalValues: Omit<ItemUpdate, "id">;
};
export type UpdateItemOperation = BaseOperation<
  "updateItem",
  UpdateItemPayload
>;

export type Operation = CreateItemOperation | UpdateItemOperation;
