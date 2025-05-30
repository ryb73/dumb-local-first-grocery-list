# Local-First Sync & Change-Tracking Plan

## App Description

This is a local-first grocery list app. The UI, for development purposes, currently maintains and renders two lists: one representing the "client" and one representing the "server". Both lists are stored in separate SQLite databases in OPFS on the client. This setup simulates client-server synchronization and conflict resolution workflows. **Note:** Local-first synchronization features described in this document are not yet implemented; the current app is a foundation for these features.

## Desired Change-Tracking & Sync System

- **Abstract Operation Log:**
  - All user actions that mutate the database are recorded as abstract operations, e.g. `{ type: 'addItem', payload: { name, created_at, checked } }`.
  - Each operation includes enough information to be losslessly reversible (e.g., a `deleteItem` operation logs the full item so it can be re-added).

- **Migration Compatibility:**
  - Migrations are handled separately from the operation log using the existing migration infrastructure.
  - All available migrations are run at app initialization for both client and server.
  - Before any sync operation, the client and server must verify they have the same migration state (e.g., same highest applied migration ID).
  - If migration states differ, sync is blocked until both sides are updated to the same migration level.

- **Operation Log Storage:**
  - The operation log itself will be stored in SQLite. This leverages the same durability, queryability, and transactional guarantees as the main app data, and keeps all local-first state in a single technology. (If a better approach is identified, it can be considered.)
  - **Careful:** Make sure updates to the operational log and corresponding updates to the primary database are atomic – i.e. if an update to the database fails, the operation log should not be updated, and vice versa.

- **Detailed Sync Algorithm:**
  The following steps outline the synchronization process when a user initiates a sync:
  0.  **Migration Compatibility Check:** Before any data sync operations, the client and server verify they have the same migration state. If migration states differ, sync is aborted with an error indicating that one or both sides need to be updated.
  1.  **Client Requests Changes:** The client requests from the server all changes (`remoteOps`) that were applied on the server after the timestamp/version of the most recent server change known to the client. The server also returns its current version identifier (e.g., timestamp or hash).
  2.  **Client Unwinds Local Changes:** The client unwinds (rolls back) any local, unsynced changes (`localOps`) that have been applied since the last known server state. This returns the client's database to the state it was in at the point of the last successful sync with the server.
  3.  **Build Rebased Local Operations List (`rebasedLocalOps`):** The client transforms its `localOps` based on the server's `remoteOps` to produce a new list of changes to be reapplied (`rebasedLocalOps`). This process ensures that local changes are adjusted as if they were made *after* the server's changes.
      ```javascript-pseudocode
      rebasedLocalOps = remoteOps.reduce(
          (currentRebasedLocalOps, remoteOp) => { // currentRebasedLocalOps is the accumulator
              return currentRebasedLocalOps.flatMap(localOp => resolveConflict(remoteOp, localOp));
          },
          localOps // Initial accumulator is the original list of localOps
      )
      ```
  4.  **Client Applies Changes:** The client applies `remoteOps` to its local database first. Then, it applies the newly computed `rebasedLocalOps` list. These operations should be performed within a single transaction to ensure atomicity.
  5.  **Client Submits Rebased Changes:** The client submits `rebasedLocalOps` to the server, along with the server version identifier received in Step 1.
  6.  **Server Applies Changes:** The server checks if its current version matches the version identifier submitted by the client.
      - If versions match: The server applies `rebasedLocalOps` atomically. If successful, it acknowledges success to the client.
      - If versions mismatch (another client synced in the interim): The server rejects the submission. The client must then restart the sync process from Step 1 to fetch the latest server changes.

- **Conflict Resolution (`resolveConflict` function):**
  - The `resolveConflict(remoteOp, localOp)` function is the core of the conflict resolution logic. It takes a single server operation (`remoteOp`) and a single (potentially already transformed) client operation (`localOp`).
  - It returns a list containing zero, one, or more operations. This resulting list represents how the `localOp` should be transformed, or if it should be discarded, in light of the `remoteOp`.
  - For example, the function might return:
    - `[localOp']`: The `localOp` is modified to `localOp'`.
    - `[localOp]`: The `localOp` is unaffected by `remoteOp` and should be kept as is.
    - `[]`: The `remoteOp` makes `localOp` redundant, or the defined conflict resolution strategy dictates that `localOp` should be discarded in favor of `remoteOp`.
  - The specific strategy for resolving conflicts (e.g., last-write-wins, operational transformation, CRDT-like merging for specific types) is an implementation detail encapsulated within this function. The plan is agnostic to the specific strategy, allowing it to evolve.

- **Key Considerations for Sync Algorithm:**
    - **Atomicity:** Client-side application of `remoteOps` and `rebasedLocalOps`, and server-side application of `rebasedLocalOps` must be atomic (all-or-nothing transactions).
    - **Server Concurrency:** Optimistic locking (version checking) on the server is crucial to handle concurrent sync attempts from multiple clients.
    - **Migration Compatibility:** Both client and server must be on the same migration level before any sync operations. This ensures that all operations are applied against compatible database schemas.
    - **Idempotency and Correct Sequencing:** The rebase approach transforms original `localOps` into `rebasedLocalOps`. It's vital that the operations within `rebasedLocalOps` are either idempotent or, if not inherently idempotent (e.g., an increment), their generation by `resolveConflict` and their application after `remoteOps` are carefully managed to prevent incorrect state if retries occur.
      An operation is idempotent if applying it multiple times has the same effect as applying it once (e.g., `SET status = 'complete'`). Non-idempotent operations (e.g., `INCREMENT count`) require more care.
      Idempotency of the resulting `rebasedLocalOps` provides fault tolerance, especially if the client or server needs to retry applying a batch of these operations.
      "Correctly sequenced" means that `resolveConflict` must ensure that each transformed `localOp` in `rebasedLocalOps` remains logically valid in the context of all preceding `remoteOps` and any previously transformed `localOps`.

## Architectural Decisions

- All operations must be losslessly reversible to support rollback and re-application.
- The server is currently simulated as a second SQLite database in OPFS on the client.
- Future remote sync (e.g., via HTTP API) is out of scope for now.

## Implementation Plan

1.  **Define Operation Types & `resolveConflict` Logic:**
    - [x] Specify all abstract operations (e.g., `addItem`, `deleteItem`, `updateItem`, `toggleItem`).
    - **NOTE**: the operations mentioned in this document are hypothetical. The actual set of operation that will be needed is an indeterminate implementation detail.
    - [x] Ensure each operation's payload contains all data needed for reversal and for the chosen conflict resolution strategy (e.g., timestamps, logical clocks, full before/after states).
    - [ ] Implement the core `resolveConflict(remoteOp, localOp)` function, encapsulating the chosen conflict resolution strategy.

2.  **Implement Operation Logging & Storage:**
    - [ ] Create an SQLite schema for the operation log (e.g., `groceries.log.sqlite3`).
    - [ ] Intercept all mutating database actions to log operations to this SQLite log.

3.  **Implement Migration Compatibility Checking:**
    - [ ] Create functions to query the current migration state from both client and server databases.
    - [ ] Implement migration compatibility verification before sync operations.
    - [ ] Provide clear error messages when migration states differ.

4.  **Implement Rollback & Re-application Engine:**
    - [ ] For each operation type, implement its corresponding inverse operation.
    - [ ] Create functions to:
        - [ ] Apply a list of operations to the database.
        - [ ] Roll back (apply inverse of) a list of operations.

5.  **Implement Client-Side Sync Orchestration:**
    - [ ] Implement the client-side logic for steps 0-5 of the "Detailed Sync Algorithm".
    - [ ] This includes migration compatibility checking, fetching `remoteOps`, unwinding `localOps`, building `rebasedLocalOps` using the `reduce` and `resolveConflict` logic, and applying `remoteOps` then `rebasedLocalOps` in a transaction.
    - [ ] Manage local markers for "last known server state/version".

6.  **Implement Server-Side Sync Endpoint:**
    - [ ] Develop the server endpoint to handle step 6 of the "Detailed Sync Algorithm".
    - [ ] This includes migration compatibility checking, version checking, and atomic application of `rebasedLocalOps`.
    - (Initially, this will be simulated against the second local SQLite DB).
