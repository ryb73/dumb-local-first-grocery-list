# Sync Algorithm Test Cases

This document contains a set of test cases for the synchronization and conflict resolution algorithm outlined in `PRIMARY.md`. These cases are designed to test the robustness of the sequential rebase algorithm proposed to handle complex interactions between local and remote changes.

**Note:** For all scenarios, we assume the `rebase` function takes `(localOps, remoteOps)` and the final application order is `remoteOps` followed by `rebasedLocalOps`. Operations are simplified for readability. Timestamps are represented as `T1`, `T2`, etc., for clarity.

---

### Case 1: Independent Operations (Conflict-Free)

This is a sanity check to ensure that unrelated changes don't interfere with each other.

*   **Initial State**:
    *   Item A: `{ id: 'A', name: 'Apples', checked: false }`
    *   Item B: `{ id: 'B', name: 'Bread', checked: false }`
*   **Local Operations**: `[{ type: 'setCheckedState', payload: { itemId: 'A', checked: true }, clientCreatedAt: T1 }]`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'B', newName: 'Whole Wheat Bread' }, clientCreatedAt: T2 }]`
*   **Expected `rebasedLocalOps`**: `[{ type: 'setCheckedState', payload: { itemId: 'A', checked: true } }]` (Unchanged)
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
*   **Remote Operations**: `[{ type: 'setCheckedState', payload: { itemId: 'X', checked: true }, clientCreatedAt: T2 }]`
*   **Conflict Resolution Logic**: Deletion takes precedence. `resolveConflict(remote: setCheckedState, local: deleteItem)` returns `[local]`.
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

*   **Initial State**: Item A: `{ id: 'A', name: 'Apples', checked: false, last_checked_at: null }`
*   **Local Operations**:
    1.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: true, newLastCheckedAt: T1 }, clientCreatedAt: T1 }`
    2.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: false }, clientCreatedAt: T3 }`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Green Apples' }, clientCreatedAt: T2 }]`
*   **Conflict Resolution Logic**: `renameItem` and `setCheckedState` are not in conflict. `resolveConflict` returns the local ops unchanged.
*   **Expected `rebasedLocalOps`**: The two local operations, unchanged.
*   **Expected Final State**: Item A is named 'Green Apples' and is `checked: false`.

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

---

### Case 9: Stale Local Operation Made Obsolete by Remote Sequence

This tests that a local operation is correctly discarded when a sequence of remote operations makes it both redundant and outdated.

*   **Initial State**: Item A: `{ id: 'A', name: 'Almonds', checked: false }`
*   **Local Operations**: `[{ type: 'setCheckedState', payload: { itemId: 'A', checked: true }, clientCreatedAt: T1 }]`
*   **Remote Operations**:
    1.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: true }, clientCreatedAt: T2 }`
    2.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: false }, clientCreatedAt: T3 }`
*   **Conflict Resolution Logic**: When rebasing the local `setCheckedState` op (T1), it will be transformed against the remote `setCheckedState` op (T2). Since T2 > T1, the remote operation takes precedence, and the local op should be discarded. `resolveConflict(remote: setCheckedState(false), local: setCheckedState(true))` should return `[]`.
*   **Expected `rebasedLocalOps`**: `[]`
*   **Expected Final State**: Item A is `checked: false`, reflecting the outcome of the most recent operation.

---

### Case 10: Local Operation Supersedes Remote Sequence (LWW)

This case confirms that because `setCheckedState` is idempotent, a local operation with the latest timestamp is correctly preserved and applied. The problem of intermediate states invalidating an operation's preconditions is eliminated.

*   **Initial State**: Item A: `{ id: 'A', name: 'Almonds', checked: false, last_checked_at: null }`
*   **Local Operations**: `[{ type: 'setCheckedState', payload: { itemId: 'A', checked: true, newLastCheckedAt: T3, originalChecked: false }, clientCreatedAt: T3 }]`
*   **Remote Operations**:
    1.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: true, newLastCheckedAt: T1, originalChecked: false }, clientCreatedAt: T1 }`
    2.  `{ type: 'setCheckedState', payload: { itemId: 'A', checked: false, originalChecked: true }, clientCreatedAt: T2 }`
*   **Rebase Trace**:
    1.  The local op `L1: setCheckedState(true)` is transformed against `R1: setCheckedState(true)`. Per LWW (`T3 > T1`), the intent of `L1` is preserved. `resolveConflict` produces a new operation `L1'` whose payload is updated to reflect the state after `R1` is applied. `L1'` will have `originalChecked: true` and `originalLastCheckedAt: T1`.
    2.  The resulting op `L1'` is then transformed against `R2: setCheckedState(false)`. Per LWW (`T3 > T2`), the intent is again preserved. `resolveConflict` produces the final operation `L1''` whose payload is updated to reflect the state after `R2` is applied. `L1''` will have `originalChecked: false` and `originalLastCheckedAt: T1`.
*   **Expected `rebasedLocalOps`**: `[{ type: 'setCheckedState', payload: { itemId: 'A', checked: true, newLastCheckedAt: T3, originalChecked: false, originalLastCheckedAt: T1 }, clientCreatedAt: T3 }]`. Note that `originalChecked` matches the state after all remote ops have been applied.
*   **Expected Final State**: Item A is `checked: true`.

---

### Case 11: Complex Creation and Modification Collision

This tests the interaction between `idMap` generation from a `create` conflict and subsequent modifications from both sides to the newly merged item.

*   **Initial State**: Empty list.
*   **Local Operations**:
    1.  `{ type: 'createItem', payload: { item: { id: 'uuid-local', name: 'Coffee' } }, clientCreatedAt: T1 }`
    2.  `{ type: 'renameItem', payload: { itemId: 'uuid-local', newName: 'Espresso' }, clientCreatedAt: T3 }`
*   **Remote Operations**:
    1.  `{ type: 'createItem', payload: { item: { id: 'uuid-remote', name: 'Coffee' } }, clientCreatedAt: T2 }`
    2.  `{ type: 'setCheckedState', payload: { itemId: 'uuid-remote', checked: true }, clientCreatedAt: T4 }`
*   **Rebase Trace**:
    1.  **Process local `createItem`**: Conflicts with remote `createItem`. `resolveConflict` merges them, returning `{ ops: [], mappings: { 'uuid-local': 'uuid-remote' } }`. The `idMap` is now set.
    2.  **Process local `renameItem`**: The rebase function uses the `idMap` to retarget the `itemId` from `'uuid-local'` to `'uuid-remote'`.
    3.  The now-modified local op `{ type: 'renameItem', payload: { itemId: 'uuid-remote', newName: 'Espresso' } }` is transformed against the remote ops. It doesn't conflict with `createItem` or `setCheckedState`.
*   **Expected `rebasedLocalOps`**: `[{ type: 'renameItem', payload: { itemId: 'uuid-remote', newName: 'Espresso' } }]`
*   **Expected Final State**: One item exists: `{ id: 'uuid-remote', name: 'Espresso', checked: true }`.

---

### Case 12: Conflicting Renames to the Same New Name (Remote Wins)

This case explores a direct conflict where two different items are renamed to the same unique name. The resolution strategy is that the remote operation always wins, and the local operation is transformed into a deletion of the item it intended to rename, preventing a unique constraint violation. This provides a deterministic outcome without relying on timestamps.

*   **Initial State**:
    *   Item A: `{ id: 'A', name: 'Tea', unique: true }`
    *   Item B: `{ id: 'B', name: 'Water', unique: true }`
*   **Local Operations**: `[{ type: 'renameItem', payload: { itemId: 'A', newName: 'Sparkling Water' }, clientCreatedAt: T2 }]`
*   **Remote Operations**: `[{ type: 'renameItem', payload: { itemId: 'B', newName: 'Sparkling Water' }, clientCreatedAt: T1 }]`
*   **Conflict Resolution Logic**:
    *   The remote operation `rename(B, 'Sparkling Water')` is part of the context that local operations are rebased against.
    *   When the local `rename(A, 'Sparkling Water')` is processed, `resolveConflict` detects that this will violate the unique name constraint.
    *   The defined strategy is "remote wins". Therefore, the local rename is rejected. To resolve the situation, the local operation is transformed into an operation to delete Item A.
*   **Expected `rebasedLocalOps`**: `[{ type: 'deleteItem', payload: { itemId: 'A' } }]`
*   **Expected Final State**:
    *   Item B: `{ id: 'B', name: 'Sparkling Water' }`
    *   Item A is deleted.

---

### Case 13: Redundant Deletion

This tests that the rebase logic correctly handles cases where both sides delete the same item. The local deletion should be discarded as redundant.

*   **Initial State**:
    *   Item A: `{ id: 'A', name: 'Cookies' }`
*   **Local Operations**: `[{ type: 'deleteItem', payload: { itemId: 'A' }, clientCreatedAt: T2 }]`
*   **Remote Operations**: `[{ type: 'deleteItem', payload: { itemId: 'A' }, clientCreatedAt: T1 }]`
*   **Conflict Resolution Logic**: `resolveConflict(remote: deleteItem, local: deleteItem)` should return `[]` because the local operation is made redundant by the remote operation.
*   **Expected `rebasedLocalOps`**: `[]`
*   **Expected Final State**: Item A is deleted.
