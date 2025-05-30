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
 * Payload for when an item is marked as checked.
 * Assumes the item was previously unchecked (checked: 0).
 */
export type SetItemCheckedPayload = {
  itemId: Item["id"];
};
export type SetItemCheckedOperation = BaseOperation<
  "setItemChecked",
  SetItemCheckedPayload
>;

/**
 * Payload for when an item is marked as unchecked.
 * Assumes the item was previously checked (checked: 1).
 * Includes the timestamp for when the item was unchecked.
 */
export type SetItemUncheckedPayload = {
  itemId: Item["id"];
  /** The new timestamp (UTC ms since epoch) when the item was marked as unchecked. */
  newLastUncheckedAt: number;
  /** The original value of last_unchecked_at. Necessary for rollbacks. */
  originalLastUncheckedAt: Item["last_unchecked_at"];
};
export type SetItemUncheckedOperation = BaseOperation<
  "setItemUnchecked",
  SetItemUncheckedPayload
>;

/**
 * Payload for when an item's name is changed.
 */
export type RenameItemPayload = {
  itemId: Item["id"];
  newName: Item["name"];
  originalName: Item["name"];
};
export type RenameItemOperation = BaseOperation<
  "renameItem",
  RenameItemPayload
>;

export type Operation =
  | CreateItemOperation
  | SetItemCheckedOperation
  | SetItemUncheckedOperation
  | RenameItemOperation;
