import { initMergedDatabase } from "@grocery-list/shared";
import { SQLocalKysely } from "sqlocal/kysely";
import { Database } from "../db/database.js";

/**
 * LocalStorage key for storing the list registry.
 */
const REGISTRY_KEY = `grocery-list-registry`;

/**
 * Metadata for a list in the registry.
 */
export type ListMetadata = {
  listId: string;
  name: string;
  lastModified: Date;
};

/**
 * Gets the raw list of UUIDs from localStorage.
 */
function getRegistry(): string[] {
  const json = localStorage.getItem(REGISTRY_KEY);
  if (json === null) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    // Validate that all items are strings
    return parsed.every((item): item is string => typeof item === `string`)
      ? parsed
      : [];
  } catch {
    return [];
  }
}

/**
 * Saves the list of UUIDs to localStorage.
 */
function saveRegistry(registry: string[]): void {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

/**
 * Checks if a list exists in the local registry.
 */
export function listExistsLocally(listId: string): boolean {
  const registry = getRegistry();
  return registry.includes(listId);
}

/**
 * Adds a list to the registry. Idempotent - won't add duplicates.
 */
export function addListToRegistry(listId: string): void {
  const registry = getRegistry();
  if (!registry.includes(listId)) {
    registry.push(listId);
    saveRegistry(registry);
  }
}

/**
 * Removes a list from the registry.
 */
export function removeListFromRegistry(listId: string): void {
  const registry = getRegistry();
  const filtered = registry.filter((id) => id !== listId);
  saveRegistry(filtered);
}

/**
 * Gets the timestamp of the most recent operation for a list.
 */
async function getLastModifiedTimestamp(db: Database): Promise<Date> {
  const kysely = db.getKyselyInstance();
  const result = await kysely
    .selectFrom(`op_log.operations`)
    .select(`client_created_at`)
    .orderBy(`client_created_at`, `desc`)
    .limit(1)
    .executeTakeFirst();

  if (result === undefined) {
    // No operations yet - return epoch
    return new Date(0);
  }

  return new Date(result.client_created_at);
}

/**
 * Gets all lists from the registry with their metadata, sorted by most recently modified.
 */
export async function getRecentListsWithMetadata(): Promise<ListMetadata[]> {
  const registry = getRegistry();

  // Load metadata for each list
  const listsWithMetadata = await Promise.all(
    registry.map(async (listId) => {
      try {
        // Initialize the merged database
        // Note: Using "-one" suffix to match ParallelGroceryLists component
        const kysely = await initMergedDatabase(
          `${listId}-one.log.sqlite3`,
          new SQLocalKysely(`${listId}-one.sqlite3`).dialect,
          new SQLocalKysely(`${listId}-one.log.sqlite3`).dialect,
          false // Don't run migrations - assume database exists
        );

        const db = new Database(kysely);
        const name = await db.getListName();
        const lastModified = await getLastModifiedTimestamp(db);

        // Close the database connection
        await kysely.destroy();

        return { listId, name, lastModified };
      } catch (error) {
        // If database fails to load, show placeholder (it might have been purged from OPFS but still exist on the server)
        console.error(`Failed to load metadata for list ${listId}:`, error);
        return { listId, name: `(Missing List)`, lastModified: new Date(0) };
      }
    })
  );

  // Sort by lastModified (most recent first)
  return Array.from(listsWithMetadata).sort(
    (a, b) => b.lastModified.getTime() - a.lastModified.getTime()
  );
}
