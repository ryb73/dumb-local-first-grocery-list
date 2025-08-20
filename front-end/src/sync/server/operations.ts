import { sql } from "kysely";
import type { Operation } from "../../operation-logging/operation-types";
import { operationSchema } from "../../operation-logging/operation-types";
import type { ServerChangesResponse } from "../client/request-changes";
import { getServerDatabase } from "./database";

/**
 * Gets operations from the server that were committed after the specified version.
 * This is the server-side implementation that would run on the actual server.
 */
async function getOperationsAfterVersion(
  afterVersion: number | null
): Promise<Operation[]> {
  const serverDb = await getServerDatabase();

  try {
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
  } finally {
    await serverDb.destroy();
  }
}

/**
 * Gets operations from the server that were committed after the specified version,
 * along with the current server version identifier.
 * This supports step 1 of the sync algorithm with version tracking.
 */
export async function getOperationsAfterVersionWithVersion(
  afterVersion: number | null
): Promise<ServerChangesResponse> {
  const serverDb = await getServerDatabase();

  try {
    // Get operations and current server version in parallel
    const [operations, serverVersionResult] = await Promise.all([
      getOperationsAfterVersion(afterVersion),
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
  } finally {
    await serverDb.destroy();
  }
}
