import path from "path";
import { initMergedDatabase } from "@grocery-list/shared";
import type { MainDB, OperationLogDB } from "@grocery-list/shared";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

/**
 * Creates a connection to the server database using better-sqlite3.
 * This replaces the SQLocalKysely (OPFS) connection used in the client simulation.
 *
 * @param listId - UUID of the list to connect to
 */
export async function getServerDatabase(listId: string) {
  // Use a data directory for server databases
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;

  const mainDbPath = path.join(dataDir, `${listId}.sqlite3`);
  const logDbPath = path.join(dataDir, `${listId}.log.sqlite3`);

  // Create better-sqlite3 connections
  const mainDb = new Database(mainDbPath);
  const logDb = new Database(logDbPath);

  // Create Kysely dialects from better-sqlite3 connections
  const mainDialect = new SqliteDialect({
    database: mainDb,
  });

  const logDialect = new SqliteDialect({
    database: logDb,
  });

  // Initialize the merged database with migrations
  return await initMergedDatabase(logDbPath, mainDialect, logDialect);
}

/**
 * Creates a connection to the main database for migrations.
 *
 * @param listId - UUID of the list to connect to
 */
export function getMainDatabase(listId: string): Kysely<MainDB> {
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;
  const mainDbPath = path.join(dataDir, `${listId}.sqlite3`);

  const mainDb = new Database(mainDbPath);
  const mainDialect = new SqliteDialect({
    database: mainDb,
  });

  return new Kysely<MainDB>({
    dialect: mainDialect,
  });
}

/**
 * Creates a connection to the operation log database for migrations.
 *
 * @param listId - UUID of the list to connect to
 */
export function getOperationLogDatabase(
  listId: string
): Kysely<OperationLogDB> {
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;
  const logDbPath = path.join(dataDir, `${listId}.log.sqlite3`);

  const logDb = new Database(logDbPath);
  const logDialect = new SqliteDialect({
    database: logDb,
  });

  return new Kysely<OperationLogDB>({
    dialect: logDialect,
  });
}
