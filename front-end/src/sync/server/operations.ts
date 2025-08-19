import type { Operation } from "../../operation-logging/operation-types";
import { operationSchema } from "../../operation-logging/operation-types";
import { getServerDatabase } from "./database";

/**
 * Gets operations from the server that were committed after the specified version.
 * This is the server-side implementation that would run on the actual server.
 */
export async function getOperationsAfterVersion(
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
