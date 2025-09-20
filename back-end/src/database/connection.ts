import path from "path";
import { initMergedDatabase } from "@grocery-list/shared";
import type { MainDB, MergedDB, OperationLogDB } from "@grocery-list/shared";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";

/**
 * Creates a connection to the server database using better-sqlite3.
 * This replaces the SQLocalKysely (OPFS) connection used in the client simulation.
 */
export async function getServerDatabase(): Promise<Kysely<MergedDB>> {
  // Use a data directory for server databases
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;

  const mainDbPath = path.join(dataDir, `grocery-list-server.sqlite3`);
  const logDbPath = path.join(dataDir, `grocery-list-server.log.sqlite3`);

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
  return await initMergedDatabase(
    logDbPath, // Used for logging/identification
    mainDialect,
    logDialect
  );
}

/**
 * Creates a connection to the main database for migrations.
 */
export function getMainDatabase(): Kysely<MainDB> {
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;
  const mainDbPath = path.join(dataDir, `grocery-list-server.sqlite3`);

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
 */
export function getOperationLogDatabase(): Kysely<OperationLogDB> {
  const dataDir = process.env[`DATA_DIR`] ?? `./data`;
  const logDbPath = path.join(dataDir, `grocery-list-server.log.sqlite3`);

  const logDb = new Database(logDbPath);
  const logDialect = new SqliteDialect({
    database: logDb,
  });

  return new Kysely<OperationLogDB>({
    dialect: logDialect,
  });
}
