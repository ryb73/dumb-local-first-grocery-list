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
  // Note: Creating both "-one" and "-two" databases to match ParallelGroceryLists pattern
  const [kysely1, kysely2] = await Promise.all([
    initMergedDatabase(
      `${listId}-one.log.sqlite3`,
      new SQLocalKysely(`${listId}-one.sqlite3`).dialect,
      new SQLocalKysely(`${listId}-one.log.sqlite3`).dialect,
      true // Run migrations to create schema
    ),
    initMergedDatabase(
      `${listId}-two.log.sqlite3`,
      new SQLocalKysely(`${listId}-two.sqlite3`).dialect,
      new SQLocalKysely(`${listId}-two.log.sqlite3`).dialect,
      true // Run migrations to create schema
    ),
  ]);

  try {
    // Add list to user's local registry
    addListToRegistry(listId);
  } finally {
    // Close the database connections (will be reopened when user navigates to list)
    await Promise.all([kysely1.destroy(), kysely2.destroy()]);
  }

  return listId;
}
