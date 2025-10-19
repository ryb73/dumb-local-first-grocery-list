/* eslint-disable import/no-unused-modules */
import { z } from "zod";

/**
 * Represents the unique identifier for a migration.
 */
export const migrationIdSchema = z.string();
export type MigrationId = z.infer<typeof migrationIdSchema>;

/**
 * A generic base schema for all operations.
 * This structure aligns with the `operations` table in `groceries.log.sqlite3`.
 */
const baseOperationSchema = z.object({
  /** Timestamp (UTC ms since epoch) when the operation was created on the client. */
  clientCreatedAt: z.number(),
  /** Unique ID for this specific operation instance. */
  id: z.string(),
  /** The payload of the operation, containing all necessary details to apply or reverse the operation. */
  payload: z.unknown(),
  /** Timestamp (UTC ms since epoch) when the operation was committed to the server, or null if not yet committed. */
  serverCommittedAt: z.number().nullable(),
  /** The type of operation. */
  type: z.string(),
});

// --- Item Operations ---

/**
 * Schema for the payload when a new item is created.
 */
export const createItemPayloadSchema = z.object({
  item: z.object({
    createdAt: z.number(),
    id: z.string(),
    name: z.string(),
  }),
});
export type CreateItemPayload = z.infer<typeof createItemPayloadSchema>;

/**
 * Schema for operation when a new item is definitively inserted.
 * This corresponds to the case in `Database.addItem` where `existingRow` is null.
 */
export const createItemOperationSchema = baseOperationSchema.extend({
  type: z.literal(`createItem`),
  payload: createItemPayloadSchema,
});
export type CreateItemOperation = z.infer<typeof createItemOperationSchema>;

/**
 * Schema for the payload when an item's checked state is set.
 */
export const setCheckedStatePayloadSchema = z
  .object({
    itemId: z.string(),
    /** The original checked state. Necessary for rollbacks. */
    originalChecked: z.boolean(),
    /** The original value of last_checked_at. Necessary for rollbacks. */
    originalLastCheckedAt: z.number().nullable(),
  })
  .and(
    z.discriminatedUnion(`checked`, [
      z.object({
        /** The new checked state. */
        checked: z.literal(false),
      }),
      z.object({
        /** The new checked state. */
        checked: z.literal(true),
        /**
         * The new timestamp (UTC ms since epoch) for when the item was marked as checked.
         * This is only populated when `checked` is `true`.
         */
        newLastCheckedAt: z.number(),
      }),
    ])
  );
export type SetCheckedStatePayload = z.infer<
  typeof setCheckedStatePayloadSchema
>;

export const setCheckedStateOperationSchema = baseOperationSchema.extend({
  type: z.literal(`setCheckedState`),
  payload: setCheckedStatePayloadSchema,
});
export type SetCheckedStateOperation = z.infer<
  typeof setCheckedStateOperationSchema
>;

/**
 * Schema for the payload when an item's name is changed.
 */
export const renameItemPayloadSchema = z.object({
  itemId: z.string(),
  newName: z.string(),
  /** The original item before renaming. Necessary for conflict resolution and rollbacks. */
  originalItem: z.object({
    createdAt: z.number(),
    name: z.string(),
    checked: z.boolean(),
    lastCheckedAt: z.number().nullable(),
  }),
});
export type RenameItemPayload = z.infer<typeof renameItemPayloadSchema>;

export const renameItemOperationSchema = baseOperationSchema.extend({
  type: z.literal(`renameItem`),
  payload: renameItemPayloadSchema,
});
export type RenameItemOperation = z.infer<typeof renameItemOperationSchema>;

/**
 * Schema for the payload when an item is deleted.
 */
export const deleteItemPayloadSchema = z.object({
  itemId: z.string(),
  deletedItem: z.object({
    createdAt: z.number(),
    name: z.string(),
    checked: z.boolean(),
    lastCheckedAt: z.number().nullable(),
  }),
  /**
   * If true, prevents ID mapping transformation during conflict resolution.
   * Used when deleting a local item that should not be redirected to a merged remote item.
   */
  noIdMap: z.boolean().optional(),
});
export type DeleteItemPayload = z.infer<typeof deleteItemPayloadSchema>;

/**
 * Schema for operation when an item is deleted. This is only used when resolving conflicts; it is not used
 * in the normal course of operation.
 */
export const deleteItemOperationSchema = baseOperationSchema.extend({
  type: z.literal(`deleteItem`),
  payload: deleteItemPayloadSchema,
});
export type DeleteItemOperation = z.infer<typeof deleteItemOperationSchema>;

// --- List Metadata Operations ---

/**
 * Schema for the payload when the list name is changed.
 */
export const setListNamePayloadSchema = z.object({
  newName: z.string(),
  /** The original list name before renaming. Necessary for rollbacks. */
  originalName: z.string(),
});
export type SetListNamePayload = z.infer<typeof setListNamePayloadSchema>;

export const setListNameOperationSchema = baseOperationSchema.extend({
  type: z.literal(`setListName`),
  payload: setListNamePayloadSchema,
});
export type SetListNameOperation = z.infer<typeof setListNameOperationSchema>;

/**
 * Schema for any operation type.
 */
export const operationSchema = z.discriminatedUnion(`type`, [
  createItemOperationSchema,
  deleteItemOperationSchema,
  renameItemOperationSchema,
  setCheckedStateOperationSchema,
  setListNameOperationSchema,
]);
export type Operation = z.infer<typeof operationSchema>;
