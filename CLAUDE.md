# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A local-first grocery list application with multi-device sync. The app uses a custom operational transformation (OT) sync algorithm to maintain consistency between client and server, storing all data in SQLite databases.

## Workspace Structure

This is a pnpm workspace monorepo with three main packages:

- **front-end**: SolidJS web application running in the browser
- **back-end**: Express server for sync coordination
- **shared**: Common types, database schemas, operations, and sync logic

## Common Development Commands

### Running the Application
```bash
# Start front-end dev server (port 3000)
cd front-end && pnpm dev

# Start back-end server (port 3001)
cd back-end && pnpm dev
```

### Testing
```bash
# Run all tests in a package
pnpm test

# Run tests in watch mode (for development)
cd <package> && pnpm vitest
```

### Linting
```bash
# Lint a package
pnpm lint
```

### Type Checking
```bash
# Run TypeScript compiler in watch mode
cd <package> && pnpm typewatch
```

### Database Schema Changes

When modifying database schemas, you must regenerate Kysely types:

```bash
# For main database schema changes
cd front-end && pnpm migrate-for-codegen && pnpm generate-kysely-types

# For operation log schema changes
cd front-end && pnpm migrate-for-operation-log-codegen && pnpm generate-operation-log-kysely-types
```

The same commands are available in the `shared` package.

## Architecture

### Local-First Sync Model

The application implements a sophisticated local-first architecture:

1. **Dual SQLite Databases**: Each "list" (client and server) maintains two SQLite databases:
   - Main database (`groceries.sqlite3`): Contains the application data (grocery items)
   - Operation log database (`groceries.log.sqlite3`): Records all mutations as abstract operations

2. **Operation Log**: All database mutations are logged as reversible operations with payloads that contain full state information. Operations include:
   - `createItem`: Insert a new grocery item
   - `setCheckedState`: Toggle item checked/unchecked
   - `renameItem`: Change an item's name
   - `deleteItem`: Remove an item (used only during conflict resolution)

3. **Sync Algorithm**: Client-server synchronization follows a rebase-like algorithm:
   - Client fetches remote operations from server
   - Client unwinds local uncommitted operations
   - Client transforms local operations against remote operations (conflict resolution)
   - Client applies remote operations, then rebased local operations
   - Client submits rebased operations to server
   - Server validates version and applies operations atomically

4. **Conflict Resolution**: The `resolveConflict` function in `shared/src/operations/resolve-conflict.ts` handles operational transformation. It maintains a rebase context for tracking ID mappings when duplicate items are merged.

5. **Migration Compatibility**: Both client and server must be on the same migration level before syncing. Sync is blocked if migration states differ.

### Front-End Architecture

- **Framework**: SolidJS (NOT React)
  - Use `createSignal` instead of `useState`
  - Use `class` instead of `className`
  - Use `@solidjs/router` for routing
- **Database Access**: SQLite databases stored in OPFS (Origin Private File System)
  - Use Kysely for type-safe database queries
  - Database wrapper: `front-end/src/db/database.ts`
- **Sync Client**: `front-end/src/sync/client/` contains all client-side sync logic
- **Long-Polling**: Client uses long-polling (`/changes/poll`) to receive real-time notifications of server changes

### Back-End Architecture

- **Framework**: Express server
- **Database**: SQLite (using better-sqlite3)
- **Sync Endpoint**: `POST /sync` handles the combined sync operation
- **Long-Polling**: `GET /changes/poll` endpoint for real-time change notifications
- **Change Notification**: Uses EventEmitter to notify connected clients when data changes

### Shared Package

Contains code shared between front-end and back-end:

- **Database Migrations**: `shared/src/database/migrations.ts` and `operation-log-migrations.ts`
- **Operation Types**: `shared/src/operations/operation-types.ts` - Zod schemas for all operations
- **Sync Logic**:
  - `shared/src/operations/apply-operation.ts`: Apply operations to database
  - `shared/src/operations/reverse-operation.ts`: Rollback operations
  - `shared/src/operations/rebase.ts`: Transform operations for conflict resolution
  - `shared/src/operations/resolve-conflict.ts`: Core conflict resolution logic
- **Type Generation**: Kysely types are generated from migrations (`main-db.d.ts`, `operation-log-db.d.ts`)

## Development Workflow

### Adding New Operations

When adding a new operation type:

1. Define the operation schema in `shared/src/operations/operation-types.ts`
2. Add the operation to the discriminated union at the bottom
3. Implement `applyOperation` logic in `shared/src/operations/apply-operation.ts`
4. Implement `reverseOperation` logic in `shared/src/operations/reverse-operation.ts`
5. Add conflict resolution rules in `shared/src/operations/resolve-conflict.ts`
6. Update the Database class in `front-end/src/db/database.ts` to log the operation

### Modifying Database Schema

1. Add a new migration to `shared/src/database/migrations.ts` (or `operation-log-migrations.ts`)
2. Run migration and regenerate types (see commands above)
3. Update the affected queries and operations

### Testing Sync Logic

The sync algorithm has extensive test coverage in `shared/src/operations/rebase.test.ts`. When modifying sync logic, add test cases for new scenarios.

## Multi-Tenant Migration (In Progress)

The application is being migrated to support multiple independent grocery lists. See `front-end/planning-documents/multi-tenant-migration/prd.md` for the full plan. Key changes:

- Each list will have its own UUID-based URL (`/list/<uuid>`)
- Each list will maintain separate SQLite databases (both client and server)
- Link-based sharing model (anyone with link can edit)
- No authentication or ownership model

## Important Notes

- **Module Format**: This is an ESM project. Use `.js` extension for imports.
- **Package Manager**: Use pnpm for all package management
- **Atomicity**: Database mutations and operation log updates must be atomic (use transactions)
- **OPFS**: Front-end SQLite databases use Origin Private File System (browser-only storage)
- **SQLite in Browser**: Uses `sqlocal` library which wraps `@sqlite.org/sqlite-wasm`
