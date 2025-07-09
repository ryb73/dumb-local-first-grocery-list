/**
 * Merged database types for working with both main database and operation log
 * database in a single transaction using SQLite's ATTACH DATABASE feature.
 */

import type { DB as MainDB } from "../../db";
import type { DB as OperationLogDB } from "../../operation-log-db";

/**
 * Database type that includes tables from both the main database
 * and the operation log database (prefixed with "op_log.")
 */
export type MergedDB = MainDB & {
  [K in keyof OperationLogDB as `op_log.${string & K}`]: OperationLogDB[K];
};
