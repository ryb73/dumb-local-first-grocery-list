# Multi-Tenant, Multi-List Migration PRD

## Overview

This document outlines the product requirements for migrating the grocery list application from a single-tenant, single-list architecture to a multi-tenant, multi-list architecture. The migration maintains the existing local-first sync infrastructure while enabling users to create and manage multiple independent grocery lists.

## Goals

1. **Enable Multiple Lists**: Allow users to create, access, and manage multiple independent grocery lists
2. **Link-Based Sharing**: Enable anyone with a list's URL to access and edit that list
3. **Maintain Local-First Architecture**: Preserve the existing sync algorithm and local-first principles
4. **Database Isolation**: Store each list in its own SQLite database (both client and server)
5. **Seamless Multi-Device Access**: Support accessing the same list from multiple devices

## Non-Goals (Out of Scope)

- User authentication or account system
- List ownership or permission levels beyond "anyone with link can edit"
- Advanced list organization (folders, tags, favorites)
- Search/filter functionality for large list collections (50+ lists)
- List archiving or deletion
- Migration of existing development data

## Authentication & Access Control

### Link-Based Access Model
- **No traditional authentication**: Following the Google Docs "anyone with the link can edit" model
- **UUID-based URLs**: Each list identified by a UUIDv4 (e.g., `550e8400-e29b-41d4-a916-446655440000`)
- **No ownership concept**: All users with the link have equal access and editing privileges
- **Privacy through obscurity**: Lists are private unless the URL is shared

### URL Structure
- **List URL format**: `/list/<uuid>`
- **Root URL**: `/` - Landing page for list discovery and creation

## User Flows

### First Visit (New User)
1. User navigates to `/` (root URL)
2. Landing page displays "Create New List" button
3. User clicks "Create New List"
4. System generates a UUIDv4 for the new list, with default title of "Untitled List"
5. System creates client-side databases for the list
6. User is redirected to `/list/<uuid>`
7. List is shown ready for use

### Subsequent Visits (Returning User)
1. User navigates to `/` (root URL)
2. Landing page displays:
   - "Create New List" button
   - "Your Lists" section showing previously accessed lists
3. User either:
   - Clicks on a list from the history to open it, OR
   - Creates a new list following the "First Visit" flow

### Accessing a Shared List
1. User receives a link from another user (e.g., `/list/550e8400-e29b-41d4-a916-446655440000`)
2. User navigates to the URL
3. System checks if list exists on client already:
   - **If exists**: Skip to step 6
4. System checks if list exists on server:
   - **If exists**: Creates local client databases and syncs data from server
   - **If not exists**: Displays error message "List not found"
5. List is added to user's "Recently Accessed Lists"
6. User can view and edit the list

### Creating and Sharing a List
1. User creates a new list (see "First Visit" flow)
2. User adds items to the list (optional)
3. User clicks "Share" button in the UI
4. Share modal/popover displays:
   - The full list URL
   - "Copy Link" button
5. User clicks "Copy Link" to copy URL to clipboard
6. User shares the URL via any communication channel
7. Recipients can access the list using the shared URL

### Offline List Creation
1. User creates a new list while offline
2. UUID is generated client-side
3. Local databases are created
4. List is immediately usable at `/list/<uuid>`
5. When user comes online, list syncs to server on first sync operation
6. URL remains valid and shareable even before first sync

### Renaming a List
1. User opens a list
2. User clicks on list name
3. Inline editor appears
4. User enters new name and confirms
5. List name is updated in list metadata
6. Change is logged as an operation and synced to server

## Database Architecture

### Client-Side Storage (OPFS)
Each list maintains two SQLite databases in OPFS:
- **Main database**: `<uuid>.sqlite3` - Contains grocery items and list data
- **Operation log database**: `<uuid>.log.sqlite3` - Contains sync operation log

**Testing Multiple Clients**: When testing multiple client instances accessing the same list (e.g., simulating two devices), use suffixed database names locally (`<uuid>-one.sqlite3`, `<uuid>-two.sqlite3`) while syncing with the server using the base `<uuid>`. This allows parallel testing without conflicts.

### Server-Side Storage
Each list maintains two SQLite databases on the filesystem:
- **Main database**: `<uuid>.sqlite3` - Contains grocery items and list data
- **Operation log database**: `<uuid>.log.sqlite3` - Contains sync operation log

### List Registry/Index
The list of recently accessed lists will be stored in **browser localStorage** as a simple array of UUIDs. This provides sufficient functionality for tracking list access history without the overhead of maintaining a separate database.

## List Metadata

Each list should track the following metadata:
- **Name** (user-editable, default: "Untitled List")

## Technical Implementation

### List Lifecycle

#### List Creation
1. Generate UUIDv4 on client
2. Initialize client-side SQLite databases (`<uuid>.sqlite3`, `<uuid>.log.sqlite3`)
3. Run all migrations on both databases
4. Initialize list metadata (name, created timestamp)
5. Add list to user's local registry
6. Navigate to `/list/<uuid>`

#### List Loading
1. Parse UUID from URL
2. Check if list exists in local registry:
   - **If exists locally**: Open existing local databases
   - **If not exists locally**: Fetch from server (see "Server Interaction")
3. Load list data and render UI

#### Server Interaction
When accessing a list not in local registry:
1. Send request to server: `GET /list/<uuid>/exists`
2. Server checks for existence of `<uuid>.sqlite3`
3. **If exists**:
   - Initialize local databases
   - Perform initial sync from server
   - Add to local registry
   - Render list
4. **If not exists**:
   - Display error: "List not found"
   - Provide option to return to home page

### UI Architecture

#### Landing Page (`/`)
- **Header**: App title/branding
- **Create New List Section**:
  - Prominent "Create New List" button
- **Recently Accessed Lists Section**:
  - List of previously accessed lists
  - Each entry shows:
    - List name
    - Last modified timestamp (if available)
  - Click to open list
  - Empty state message for new users

## API Endpoints

### New Endpoints Required

#### Check List Existence
```
GET /list/<uuid>/exists
Response: { exists: boolean }
```

#### Sync Endpoint (Modified)
```
POST ~~/sync~~ /list/<uuid>/sync
```
- Existing `/sync` endpoint moved to `/list/<uuid>/sync` and modified to accept list ID parameter
- Routes to appropriate list database on server
- If list doesn't already exist, creates and initializes the database

#### Long-Polling Change Notification (Modified)
```
GET ~~/changes/poll~~ /list/<uuid>/changes/poll
```
- Existing `/changes/poll` endpoint moved to `/list/<uuid>/changes/poll` to scope notifications to individual lists
- Clients connect to this endpoint to receive real-time notifications when the specific list changes
- Each list has independent change notifications

## Error Handling

### List Not Found
- **Trigger**: User navigates to `/list/<uuid>` where UUID doesn't exist on server
- **Behavior**:
  - Display error message: "This list doesn't exist or has been deleted"
  - Provide "Go Home" button to return to `/`
  - Do not create local databases
  - Do not add to local registry

---

## Implementation Progress

### Phase 1: Database & Storage Architecture ✅ COMPLETED

**Back-end Changes:**
- ✅ Updated `getServerDatabase()` to accept `listId` parameter
- ✅ Modified database file paths to use `<uuid>.sqlite3` and `<uuid>.log.sqlite3` naming convention
- ✅ Updated `getMainDatabase()` and `getOperationLogDatabase()` to accept `listId` parameter
- ✅ Modified `sync()` function to accept `listId` as first parameter
- ✅ Updated `getServerMigrationState()` to accept `listId`
- ✅ Refactored `operations.ts` functions to accept `serverDb` parameter instead of creating connections internally
- ✅ Added temporary `TEMP_LIST_ID = 'default-list'` constant in server startup for backwards compatibility

**Front-end Changes:**
- ✅ Updated `ParallelGroceryLists` component to use `default-list-one` and `default-list-two` database naming
- ✅ Added migration flag (`true`) to `initMergedDatabase` calls to ensure schema is created
- ✅ Added comments documenting that both test clients sync with server using base `default-list` ID


### Phase 2: API Endpoint Updates ✅ COMPLETED

**Back-end Changes:**
- ✅ Added `GET /list/:listId/exists` endpoint to check if a list exists on the server
- ✅ Moved `POST /sync` to `POST /list/:listId/sync` with list ID as URL parameter
- ✅ Moved `GET /changes/poll` to `GET /list/:listId/changes/poll` to scope notifications per list
- ✅ Removed legacy `/sync` endpoint
- ✅ Added `listExistsResponseSchema` to shared package for response validation
- ✅ Added proper TypeScript response type annotations to all endpoints

**Front-end Changes:**
- ✅ Updated `syncWithServer()` to accept `listId` parameter and call `/list/:listId/sync`
- ✅ Added `checkListExists()` function to check list existence on server
- ✅ Updated `createLongPollingListener()` to accept `listId` parameter and call `/list/:listId/changes/poll`
- ✅ Updated `GroceryList` component to accept `listId` prop and pass it to sync and polling functions
- ✅ Updated `ParallelGroceryLists` to pass `listId="default-list"` to both list instances
- ✅ Imported `listExistsResponseSchema` from shared package

