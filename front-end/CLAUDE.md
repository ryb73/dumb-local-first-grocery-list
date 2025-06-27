# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

```bash
# Development
pnpm dev                    # Start dev server with COOP/COEP headers for SQLite WASM
pnpm build                  # Production build
pnpm test                   # Run Vitest test suite
pnpm lint                   # ESLint validation
pnpm typewatch              # TypeScript compiler in watch mode

# Database Development
pnpm migrate-for-codegen    # Apply migrations to local SQLite file
pnpm generate-kysely-types  # Generate TypeScript types from database schema
```

## Architecture Overview

This is a **local-first grocery list application** that simulates client-server synchronization using two SQLite databases in OPFS. The app is built with SolidJS, Kysely (SQLite query builder), and implements a sophisticated operation logging system for conflict resolution.

### Core Technologies
- **Frontend**: SolidJS with CSS Modules
- **Database**: SQLite via sqlocal (WebAssembly)
- **Query Builder**: Kysely with auto-generated types
- **Testing**: Vitest with in-memory SQLite

### Key Architectural Patterns

**Database-First Architecture**: All application state lives in SQLite databases. Components are reactive views over database data with 5-second refresh intervals.

**Dual Database Setup**: Two SQLite databases simulate client/server for local development:
- `initTestDatabases()` in `src/db/init.ts` creates both databases
- `ParallelGroceryLists` component manages both instances

**Operation Logging System** (in `src/operation-logging/`): Implements sophisticated local-first sync with:
- Strongly typed operation definitions (`operation-types.ts`)
- Rebase algorithm for transforming local operations against remote operations
- Conflict resolution using Last-Writer-Wins with operational transforms
- Comprehensive test suite covering sync scenarios

### Database Schema & Semantics

**Critical Semantic Note**: The `checked` field semantics were inverted during development:
- `checked: 0` = item needed (unchecked in UI)
- `checked: 1` = item in cart (checked in UI)

**Schema Evolution**: Started with separate `active_items`/`removed_items` tables, evolved to single `items` table with STRICT mode and `last_checked_at` tracking.

**Type Safety**: Database types are auto-generated via `kysely-codegen`. Always run `pnpm generate-kysely-types` after schema changes.

### Component Structure

**ParallelGroceryLists**: Root component managing two database instances for sync simulation
**GroceryList**: Main list component with items, autocomplete suggestions, and CRUD operations  
**GroceryItem**: Individual item with inline editing capabilities
**SqliteBrowser**: Debug component for database inspection (route: `/browser`)

### Current Sync Implementation Status

The local-first sync system is **partially implemented**:
- ✅ Operation type definitions and rebase algorithm
- ✅ Conflict resolution with comprehensive tests  
- ✅ Apply/reverse operation functions
- ❌ Operation logging to database (planned for separate SQLite file)
- ❌ Full sync workflow integration with UI

### Development Workflow

**Database Changes**: Always create migrations in `src/db/migrations/migrations.ts`, then run `pnpm migrate-for-codegen && pnpm generate-kysely-types` to update types.

**Testing**: Uses in-memory SQLite databases. Tests focus heavily on operation rebase scenarios with before/after state validation.

**Type Generation**: The `db.d.ts` file is auto-generated and should not be edited manually. Use `local-db-for-codegen.sqlite3` for type generation.

## Implementation Guidelines

**Database Operations**: Always use the `Database` class methods rather than raw Kysely queries. The class provides grocery-specific abstractions and proper error handling.

**Conflict Resolution**: When implementing sync features, refer to the comprehensive test cases in `rebase.test.ts` which cover complex scenarios like concurrent item creation, deletion, and editing.

**Component State**: Prefer database queries over component state. Use SolidJS signals for UI reactivity but keep data in SQLite as the single source of truth.

**Operation Logging**: When adding new mutation operations, ensure they include enough information for both forward application and reversal (see existing operations in `operation-types.ts`).