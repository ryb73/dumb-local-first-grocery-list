import { z } from "zod";
import { operationSchema } from "../operations/operation-types.js";

/**
 * Schema for migration state
 */
export const migrationStateSchema = z.object({
  /** The highest applied migration name for the main database */
  mainMigration: z.string().nullable(),
  /** The highest applied migration name for the operation log database */
  operationLogMigration: z.string().nullable(),
});

export type MigrationState = z.infer<typeof migrationStateSchema>;

/**
 * Schema for server changes response
 */
export const serverChangesResponseSchema = z.object({
  operations: operationSchema.array(),
  serverVersion: z.number().nullable(),
});

export type ServerChangesResponse = z.infer<typeof serverChangesResponseSchema>;

/**
 * Schema for sync response - discriminated union based on status
 */
export const syncResponseSchema = z.discriminatedUnion(`status`, [
  z.object({
    /** Status indicating local operations were accepted */
    status: z.literal(`accepted`),
    /** Current server version after processing */
    serverVersion: z.number().nullable(),
    /** Commit timestamps for accepted operations (indexed by operation ID) */
    commitTimestamps: z.record(z.string(), z.number()),
  }),
  z.object({
    /** Status indicating local operations were rejected due to conflicts */
    status: z.literal(`rejected`),
    /** Current server version */
    serverVersion: z.number().nullable(),
    /** Remote operations that the client needs to apply */
    remoteOperations: operationSchema.array(),
    /** Optional error message explaining the rejection */
    errorMessage: z.string().optional(),
  }),
  z.object({
    /** Status indicating migration incompatibility */
    status: z.literal(`migration_incompatible`),
    /** The server's migration state */
    serverState: migrationStateSchema,
    /** Human-readable error message */
    errorMessage: z.string(),
  }),
]);

export type SyncResponse = z.infer<typeof syncResponseSchema>;

/**
 * Schema for sync request
 */
export const syncRequestSchema = z.object({
  localOperations: operationSchema.array(),
  expectedServerVersion: z.number().nullable(),
  clientMigrationState: migrationStateSchema,
});

export type SyncRequest = z.infer<typeof syncRequestSchema>;

/**
 * Schema for long-polling request
 */
export const longPollingRequestSchema = z.object({
  /** The server version the client expects */
  expectedServerVersion: z.preprocess((val) => {
    // Handle the string "null" from query parameters
    if (val === "null" || val === "") {
      return null;
    }
    return val;
  }, z.coerce.number().nullable()),
});

export type LongPollingRequest = z.infer<typeof longPollingRequestSchema>;

/**
 * Schema for long-polling response
 */
export const longPollingResponseSchema = z.object({
  /** Whether changes are available on the server */
  hasChanges: z.boolean(),
});

export type LongPollingResponse = z.infer<typeof longPollingResponseSchema>;

/**
 * Schema for list exists response
 */
export const listExistsResponseSchema = z.object({
  /** Whether the list exists on the server */
  exists: z.boolean(),
});

export type ListExistsResponse = z.infer<typeof listExistsResponseSchema>;
