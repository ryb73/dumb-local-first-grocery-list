# Sync Algorithm Test Cases

This document contains a set of test cases for the synchronization and conflict resolution algorithm outlined in `PRIMARY.md`. These cases are designed to test the robustness of the sequential rebase algorithm proposed to handle complex interactions between local and remote changes.

**Note:** For all scenarios, we assume the `rebase` function takes `(localOps, remoteOps)` and the final application order is `remoteOps` followed by `rebasedLocalOps`. Operations are simplified for readability. Timestamps are represented as `T1`, `T2`, etc., for clarity.

---

### Case 1: Independent Operations (Conflict-Free)

This is a sanity check to ensure that unrelated changes don't interfere with each other.

*   **Initial State**:
    *   Item A: `{ id: 'A', name: 'Apples', checked: false }`
    *   Item B: `{ id: 'B', name: 'Bread', checked: false }`
*   **Local Operations**: `[{ type: 'setItemChecked', payload: { itemId: 'A' }, clientCreatedAt: T1 }]`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'B', newName: 'Whole Wheat Bread' }, clientCreatedAt: T2 }]`
*   **Expected `rebasedLocalOps`**: `[{ type: 'setItemChecked', payload: { itemId: 'A' } }]` (Unchanged)
*   **Expected Final State**:
    *   Item A: `{ id: 'A', name: 'Apples', checked: true }`
    *   Item B: `{ id: 'B', name: 'Whole Wheat Bread', checked: false }`

---

### Case 2: Direct Conflict (LWW on Rename)

Both sides rename the same item. The conflict is resolved using Last-Write-Wins, determined by the `clientCreatedAt` timestamp.

*   **Initial State**:
    *   Item A: `{ id: 'A', name: 'Milk', checked: false }`
*   **Local Operations**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Almond Milk' }, clientCreatedAt: T2 }]`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Oat Milk' }, clientCreatedAt: T1 }]`
*   **Conflict Resolution Logic**: For `renameItem` vs `renameItem`, compare `clientCreatedAt`. Since `T2 > T1`, the local operation wins. `resolveConflict` returns `[local]`.
*   **Expected `rebasedLocalOps`**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Almond Milk' } }]`
*   **Expected Final State**:
    *   Item A: `{ id: 'A', name: 'Almond Milk', checked: false }` (The remote 'Oat Milk' is applied, then overwritten).

---

### Case 3: Local Deletion vs. Remote Update

The client deletes an item that the server has modified. The deletion should always "win", regardless of timestamp.

*   **Initial State**:
    *   Item X: `{ id: 'X', name: 'Coffee', checked: false }`
*   **Local Operations**: `[{ type: 'deleteItem', payload: { itemId: 'X' }, clientCreatedAt: T1 }]`
*   **Remote Operations**: `[{ type: 'setItemChecked', payload: { itemId: 'X' }, clientCreatedAt: T2 }]`
*   **Conflict Resolution Logic**: Deletion takes precedence. `resolveConflict(remote: setItemChecked, local: deleteItem)` returns `[local]`.
*   **Expected `rebasedLocalOps`**: `[{ type: 'deleteItem', payload: { itemId: 'X' } }]`
*   **Expected Final State**: Item X is deleted.

---

### Case 4: Remote Deletion vs. Local Update

The server deletes an item that the client has modified. The local update must be discarded.

*   **Initial State**:
    *   Item Y: `{ id: 'Y', name: 'Yogurt', checked: false }`
*   **Local Operations**: `[{ type: 'renameItem', payload: { itemId: 'Y', newName: 'Greek Yogurt' }, clientCreatedAt: T2 }]`
*   **Remote Operations**: `[{ type: 'deleteItem', payload: { itemId: 'Y' }, clientCreatedAt: T1 }]`
*   **Conflict Resolution Logic**: `resolveConflict(remote: deleteItem, local: renameItem)` must return `[]`.
*   **Expected `rebasedLocalOps`**: `[]`
*   **Expected Final State**: Item Y is deleted.

---

### Case 5: The Original Problem (Sequential Dependency)

The transformation of a local operation must affect the transformation of subsequent local operations.

*   **Initial State**:
    *   Item X: `{ id: 'X', name: 'Oranges', unique: true }`
    *   Item Y: `{ id: 'Y', name: 'Pears', unique: true }`
*   **Local Operations**:
    1.  `{ type: 'renameItem', payload: { itemId: 'X', newName: 'Apples' }, clientCreatedAt: T1 }`
    2.  `{ type: 'renameItem', payload: { itemId: 'X', newName: 'Bananas' }, clientCreatedAt: T3 }`
*   **Remote Operations**:
    3.  `{ type: 'renameItem', payload: { itemId: 'Y', newName: 'Apples' }, clientCreatedAt: T2 }`
*   **Conflict Resolution Logic**:
    *   `resolveConflict(op3, op1)` -> `[op1': { type: 'deleteItem', payload: { itemId: 'X' } }]` (hypothetical resolution for unique constraint violation)
    *   `resolveConflict(op1', op2)` -> `[]` (Cannot rename a deleted item)
*   **Expected `rebasedLocalOps`**: `[{ type: 'deleteItem', payload: { itemId: 'X' } }]`
*   **Expected Final State**:
    *   Item Y: `{ id: 'Y', name: 'Apples', unique: true }`
    *   Item X is deleted.

---

### Case 6: Simple Creation Conflict

Both client and server create an item with the same unique name. The conflict resolution merges them into a single item.

*   **Initial State**: Empty list.
*   **Local Operations**: `[{ type: 'createItem', payload: { item: { id: 'uuid-local', name: 'Cheese' } }, clientCreatedAt: T1 }]`
*   **Remote Operations**: `[{ type: 'createItem', payload: { item: { id: 'uuid-remote', name: 'Cheese' } }, clientCreatedAt: T2 }]`
*   **Conflict Resolution Logic**: `resolveConflict(remote: create, local: create)` recognizes a duplicate. It returns `{ ops: [], mappings: { 'uuid-local': 'uuid-remote' } }`.
*   **Expected `rebasedLocalOps`**: `[]`
*   **Expected Final State**: One item exists: `{ id: 'uuid-remote', name: 'Cheese' }`.

---

### Case 7: Sequential Local Toggles vs. Remote Rename

Client checks and then unchecks an item. Server renames it. The final state should reflect both the rename and the final toggle state.

*   **Initial State**: Item A: `{ id: 'A', name: 'Apples', checked: false }`
*   **Local Operations**:
    1.  `{ type: 'setItemChecked', payload: { itemId: 'A' }, clientCreatedAt: T1 }`
    2.  `{ type: 'setItemUnchecked', payload: { itemId: 'A', newLastUncheckedAt: 2000 }, clientCreatedAt: T3 }`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Green Apples' }, clientCreatedAt: T2 }]`
*   **Conflict Resolution Logic**: `renameItem` and check/uncheck ops are not in conflict. `resolveConflict` returns the local op unchanged.
*   **Expected `rebasedLocalOps`**: The two local operations, unchanged.
*   **Expected Final State**: Item A is named 'Green Apples' and is unchecked.

---

### Case 8: Advanced Creation Conflict with ID Merging

This tests the `idMap` logic. Both sides create a similar item, then modify it. The rebase must correctly retarget the local modification to the canonical item ID.

*   **Initial State**: Empty list.
*   **Local Operations**:
    1.  `{ type: 'createItem', payload: { item: { id: 'uuid-local', name: 'Cheese' } }, clientCreatedAt: T1 }`
    2.  `{ type: 'renameItem', payload: { itemId: 'uuid-local', newName: 'Cheddar' }, clientCreatedAt: T3 }`
*   **Remote Operations**:
    1.  `{ type: 'createItem', payload: { item: { id: 'uuid-remote', name: 'Cheese' } }, clientCreatedAt: T2 }`
*   **Rebase Trace**:
    1.  **Process local op 1 (`createItem`)**: It conflicts with the remote `createItem`. `resolveConflict` returns `{ ops: [], mappings: { 'uuid-local': 'uuid-remote' } }`. The `idMap` is now `{ 'uuid-local': 'uuid-remote' }`.
    2.  **Process local op 2 (`renameItem`)**: The rebase function first checks `idMap` and sees that the target `itemId` ('uuid-local') should be remapped to 'uuid-remote'.
    3.  The modified local op becomes `{ type: 'renameItem', payload: { itemId: 'uuid-remote', newName: 'Cheddar' } }`. This op is transformed against the context (no conflict) and added to the final list.
*   **Expected `rebasedLocalOps`**: `[{ type: 'renameItem', payload: { itemId: 'uuid-remote', newName: 'Cheddar' } }]`
*   **Expected Final State**: One item exists: `{ id: 'uuid-remote', name: 'Cheddar' }`.
