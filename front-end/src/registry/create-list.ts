import { initMergedDatabase } from "@grocery-list/shared";
import { SQLocalKysely } from "sqlocal/kysely";
import { addListToRegistry } from "./list-registry.js";

/**
 * Creates a new grocery list with a generated UUID.
 * Initializes client-side databases, sets up metadata, and adds to registry.
 *
 * @returns The UUID of the newly created list
 */
export async function createNewList(): Promise<string> {
  // Generate UUIDv4 for the new list
  const listId = crypto.randomUUID();

  // Initialize client-side SQLite databases with migrations
  const kysely = await initMergedDatabase(
    `${listId}.log.sqlite3`,
    new SQLocalKysely(`${listId}.sqlite3`).dialect,
    new SQLocalKysely(`${listId}.log.sqlite3`).dialect,
    true // Run migrations to create schema
  );

  try {
    // Add list to user's local registry
    addListToRegistry(listId);
  } finally {
    // Close the database connection (will be reopened when user navigates to list)
    await kysely.destroy();
  }

  return listId;
}
