import type {
  MergedDB,
  Operation,
  ServerChangesResponse,
} from "@grocery-list/shared";
import { operationSchema } from "@grocery-list/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

/**
 * Gets operations from the server that were committed after the specified version.
 * This is the server-side implementation that would run on the actual server.
 *
 * @param serverDb - The server database connection
 * @param afterVersion - The version timestamp to fetch operations after (null for all)
 */
async function getOperationsAfterVersion(
  serverDb: Kysely<MergedDB>,
  afterVersion: number | null
): Promise<Operation[]> {
  // Query for operations that were committed to the server after the specified version
  let query = serverDb
    .selectFrom(`op_log.operations`)
    .selectAll()
    .where(`server_committed_at`, `is not`, null)
    .orderBy(`server_committed_at`, `asc`);

  // If we have a version threshold, only get operations after that timestamp
  if (afterVersion !== null) {
    query = query.where(`server_committed_at`, `>`, afterVersion);
  }

  const rawOperations = await query.execute();

  // Transform raw operations to the expected format for parsing
  const transformedOperations = rawOperations.map((rawOp) => ({
    clientCreatedAt: rawOp.client_created_at,
    id: rawOp.id,
    payload: JSON.parse(rawOp.payload),
    serverCommittedAt: rawOp.server_committed_at,
    type: rawOp.type,
  }));

  // Parse and validate the entire array of operations at once
  return operationSchema.array().parse(transformedOperations);
}

/**
 * Gets operations from the server that were committed after the specified version,
 * along with the current server version identifier.
 * This supports step 1 of the sync algorithm with version tracking.
 *
 * @param serverDb - The server database connection
 * @param afterVersion - The version timestamp to fetch operations after (null for all)
 */
export async function getOperationsAfterVersionWithVersion(
  serverDb: Kysely<MergedDB>,
  afterVersion: number | null
): Promise<ServerChangesResponse> {
  // Get operations and current server version in parallel
  const [operations, serverVersionResult] = await Promise.all([
    getOperationsAfterVersion(serverDb, afterVersion),
    sql<{ max_server_committed_at: number | null }>`
      SELECT MAX(server_committed_at) as max_server_committed_at
      FROM op_log.operations
      WHERE server_committed_at IS NOT NULL
    `.execute(serverDb),
  ]);

  const serverVersion =
    serverVersionResult.rows[0]?.max_server_committed_at ?? null;

  return {
    operations,
    serverVersion,
  };
}
