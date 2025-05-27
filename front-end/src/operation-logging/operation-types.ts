import type { Item, ItemUpdate } from "../types/schemas";

/**
 * Represents the unique identifier for a migration.
 */
export type MigrationId = string;

/**
 * A generic base for all operations.
 */
export interface BaseOperation<T extends string, P> {
  /** A unique ID for this specific operation instance */
  opId: string;
  type: T;
  /** Timestamp of when the operation was created on the client. */
  timestamp: number;
  payload: P;
  /** Optional: ID of the entity this operation primarily targets (e.g. item ID) */
  entityId?: string;
}

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
  changes: Partial<Omit<ItemUpdate, "id">>;
  /** The original values of the fields that were changed. */
  originalValues: Partial<Omit<ItemUpdate, "id">>;
};
export type UpdateItemOperation = BaseOperation<
  "updateItem",
  UpdateItemPayload
>;

// A union type for all possible operations
export type Operation = CreateItemOperation | UpdateItemOperation;
