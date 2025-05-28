# Operation Log Schema & Design Decisions

This document outlines the schema for the operation log database and summarizes key design decisions made during its planning. This log is a critical component of the local-first synchronization strategy detailed in `PRIMARY.md`.

## 1. Storage & Migrations

*   **Database:** The operation log will be stored in a separate SQLite database file named `groceries.log.sqlite3`.
*   **Migrations:** Database schema migrations for the operation log will be managed by Kysely.
    *   Migration files will be located in: `front-end/src/operation-logging/migrations/`.
    *   The main migration definition file will be named `migrations.ts` (i.e., `front-end/src/operation-logging/migrations/migrations.ts`), consistent with the primary database's migration naming, as its location implies its purpose.

## 2. `operations` Table Schema

The core of the operation log will be the `operations` table, defined with the following columns:

*   **`id`**: `TEXT PRIMARY KEY`
    *   A unique identifier for the operation log entry itself.
    *   Client-generated, likely a UUID.
    *   Decision: Named `id` for simplicity, rather than `op_id`.
*   **`type`**: `TEXT NOT NULL`
    *   A string representing the type of operation performed (e.g., `createItem`, `updateItem`).
    *   Values will correspond to the defined `Operation` types in `front-end/src/operation-logging/operation-types.ts`.
*   **`client_created_at_utc`**: `INTEGER NOT NULL`
    *   Timestamp (e.g., milliseconds since epoch) indicating when the operation was created on the client.
*   **`server_committed_at_utc`**: `INTEGER` (nullable)
    *   Timestamp indicating when the operation was successfully applied and acknowledged by the server.
    *   This will be `NULL` for operations that are local to the client and have not yet been synced, or for which server confirmation has not been received.
*   **`payload`**: `TEXT NOT NULL`
    *   A JSON string containing all necessary details of the operation.
    *   The structure of the payload will vary based on the `type` of operation.
    *   It must contain sufficient information for the operation to be losslessly reversible and for conflict resolution (as per `resolveConflict` in `PRIMARY.md`). This includes necessary entity identifiers (e.g., item ID).

## 3. Key Decisions & Rationale

### 3.1. `entity_id` Column (Omitted)

*   **Decision:** A dedicated `entity_id` column (which would have stored the primary ID of the entity, e.g., a grocery item, affected by the operation) was considered but **omitted** from the schema.
*   **Rationale:**
    *   The necessary entity identifiers are expected to be present within the `payload` of each operation. The `resolveConflict` function and other sync logic will primarily rely on inspecting these payloads.
    *   Avoids data redundancy between a dedicated column and the payload.
    *   Reduces schema complexity. While direct, indexed queries for an entity's history (e.g., `SELECT * FROM operations WHERE entity_id = ?`) would be simpler with a dedicated column, this was deemed a secondary concern for the core sync functionality. If such ad-hoc querying becomes critical for debugging or other features, it can be achieved by querying the JSON content of the `payload` (though potentially less performant).
    *   Addresses potential complexity if an operation affects multiple entities or if the concept of a single "primary" entity is not always clear-cut.

### 3.2. `status` Column (Omitted)

*   **Decision:** A dedicated `status` column (e.g., `local`, `sync_pending`, `synced`) was considered but **omitted** from the schema.
*   **Rationale:**
    *   The synchronization status of an operation can be effectively determined by the presence or absence of a `server_committed_at_utc` timestamp:
        *   `server_committed_at_utc IS NULL`: The operation is local, pending sync, or a previous sync attempt was not confirmed. These are the operations that will be included in `localOps` during the sync process.
        *   `server_committed_at_utc IS NOT NULL`: The operation has been acknowledged by the server.
    *   This approach simplifies the schema.
    *   A dedicated `status` field might become useful later if more granular client-side UI feedback or complex retry/error-handling strategies (beyond what's outlined in `PRIMARY.md`) are required. It can be added if a compelling need arises.

## 4. Future Considerations / Deferred Decisions

*   **Atomicity:** The atomicity of writes between the primary application database and the `groceries.log.sqlite3` database is a critical concern (as noted in `PRIMARY.md`). Strategies to ensure that an operation updates both databases or neither will need to be carefully implemented, especially since they are separate database files. This is an area for further investigation and testing by the user.
