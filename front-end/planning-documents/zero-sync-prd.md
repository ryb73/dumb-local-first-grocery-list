# Zero Migration PRD (Local-First Grocery List)

## Summary

Migrate the current local-first grocery list from a custom OPFS + operation-log + client-side rebase model to Zero (Rocicorp) with a server-authoritative Postgres backend and a synced client cache. Perform a single cutover with no data migration (clean slate). Preserve existing UX and business rules, notably unique normalized item names and otherwise last-write-wins.

## Goals

- Replace custom sync, operation logging, and conflict resolution with Zero’s query-synced client cache and server-side mutations.
- Preserve current product behavior and UX.
- Enforce unique normalized item names on the server.
- Support offline reads and queued writes via Zero’s client cache.
- Ship with a small locally-run server for development.

## Constraints & Decisions

- Server-side database must be Postgres (Zero doesn't currently support other databases on the server).
- No migration of existing data needed; we can start fresh.
- Preserve business logic semantics from the current app.
- Conflict policy: last-write-wins (LWW) except for the unique normalized name constraint (strict uniqueness).
- Directory layout: create `server/` as a sibling of `front-end/`.

## Architecture Overview

- Client (existing): Vite + React app in `front-end/`.
  - Integrate Zero client SDK.
  - Reads: subscribe to server-defined queries, backed by a persistent client cache.
  - Writes: call server mutations; remain optimistic where reasonable.

- Server (new): `server/` (Node/Bun runtime acceptable) with Zero server + Postgres.
  - Postgres connection via environment variable.
  - Define SQL schema and migrations (DDL) for items.
  - Define Zero queries (for the UI screens) and mutations (add/update/toggle/delete).
  - Mutations execute inside DB transactions and enforce business rules.

## Data Model

Table: `items`

- `id` (UUID, primary key)
- `name` (TEXT, required)
- `normalized_name` (TEXT, required, unique)
- `checked` (BOOLEAN, default false)
- `created_at` (TIMESTAMPTZ, default now())
- `updated_at` (TIMESTAMPTZ, default now())

Normalization for `normalized_name`:

- `name` trimmed
- internal whitespace collapsed to single spaces
- converted to lowercase (Unicode-safe)

Uniqueness: unique index on `normalized_name`. Attempts to create or rename to a conflicting normalized name fail with a deterministic server error.

## Queries (Zero-synced)

- `items.all`: return all items ordered by `checked ASC`, then `updated_at DESC` (or the current UI’s preferred sort semantics).
- `items.checked`: filter `checked = true`, sorted by `updated_at DESC`.
- `items.unchecked`: filter `checked = false`, sorted by `updated_at DESC`.

Notes:

- Adjust exact query set and ordering to match current UI expectations in `GroceryList.tsx`.
- Queries are the units that Zero keeps synchronized into the client cache.

## Mutations (Server)

- `addItem(name: string)`
  - Normalize `name` → `normalized_name`.
  - Insert with `checked = false`, timestamps set to now.
  - Enforce unique `normalized_name`; on violation, return a structured error (e.g., `ITEM_NAME_CONFLICT`).

- `toggleItem(id: UUID)`
  - Flip `checked` and set `updated_at = now()`.

- `updateItem(id: UUID, name?: string, checked?: boolean)`
  - If `name` provided, normalize and enforce uniqueness; update `name`, `normalized_name`.
  - If `checked` provided, update it.
  - Always set `updated_at = now()` when any field changes.

- `deleteItem(id: UUID)`
  - Delete by id.

Atomicity:

- Each mutation runs in a single DB transaction.

## Client Behavior

- Replace direct OPFS/SQLite reads with subscribed Zero queries.
- Replace direct writes/operation-log appends with Zero mutations.
- Offline reads: served from the synchronized client cache.
- Offline writes: queued by the Zero client; upon reconnect, server applies mutations; conflicts surface via mutation errors.
- Preload common queries at app start for snappy initial render.

## Cutover Plan

1. Add `server/` with Zero server, Postgres schema, queries, and mutations.
2. Wire Zero client in `front-end/` and update UI components to use queries/mutations behind a feature flag (temporary for testing).
3. Validate end-to-end locally (no data import; clean DB).
4. Remove the feature flag and eliminate custom operation-log, rebase, and simulated OPFS server paths from the UI.
