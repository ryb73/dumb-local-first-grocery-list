# Test Classification Framework for Sync Algorithm

## Overview

This document provides a systematic framework for organizing and expanding test coverage for the local-first sync algorithm. It analyzes existing test cases and identifies gaps to ensure comprehensive coverage of the conflict resolution problem space.

## Current Test Case Analysis

### Existing Tests by Operation Type Matrix

| Local ↓ / Remote → | Create | Rename | Delete | SetChecked |
|-------------------|---------|---------|---------|-------------|
| **Create** | ✅ Cases 6,8,8.5,8.6,11 | ❌ Missing | ❌ Missing | ❌ Missing |
| **Rename** | ✅ Case 8* | ✅ Cases 2,5,8.5,12 | ✅ Case 4 | ❌ Missing |
| **Delete** | ❌ Missing | ✅ Case 3 | ✅ Case 13 | ✅ Case 3 |
| **SetChecked** | ❌ Missing | ✅ Case 7 | ❌ Missing | ✅ Cases 9,10 |

*Case 8 involves create→rename sequence

## Test Classification Framework

### 1. Conflict Type Categories

#### 1.1 No Conflict (Independent Operations)
- **Covered**: Case 1 - Different items, different operations
- **Pattern**: Operations on different items or non-conflicting properties
- **Resolution**: Operations preserved unchanged

#### 1.2 Direct Conflicts (Same Item, Same Property)
- **Covered**:
  - Case 2: Rename vs Rename (LWW)
  - Case 13: Delete vs Delete (redundancy elimination)
  - Cases 9,10: SetChecked vs SetChecked (LWW with state tracking)
- **Pattern**: Two operations targeting identical item/property
- **Resolution**: Last-Write-Wins or redundancy elimination

#### 1.3 Indirect Conflicts (Constraint Violations)
- **Covered**:
  - Case 5: Unique name constraint cascade
  - Case 12: Rename collision to same name
- **Pattern**: Operations that would violate system constraints
- **Resolution**: Deletion of conflicting item (remote wins strategy)

#### 1.4 Cascading Conflicts (Sequential Dependencies)
- **Covered**: Case 5 - Rename→Delete cascade
- **Pattern**: First operation transformation affects subsequent operations
- **Resolution**: Context-dependent transformation chain

### 2. Operation Cardinality Patterns

#### 2.1 Simple (1-to-1)
- **Examples**: Cases 1, 2, 3, 4, 12, 13
- **Pattern**: Single local operation vs single remote operation

#### 2.2 Local Sequence (Many-to-1)
- **Examples**: Cases 5, 7, 8
- **Pattern**: Multiple local operations vs single remote operation
- **Challenge**: Sequential dependencies within local operations

#### 2.3 Remote Sequence (1-to-Many)
- **Examples**: Cases 9, 10
- **Pattern**: Single local operation vs multiple remote operations
- **Challenge**: Local operation may be obsoleted by remote sequence

#### 2.4 Complex (Many-to-Many)
- **Examples**: Cases 8.5, 8.6, 11
- **Pattern**: Multiple operations on both sides
- **Challenge**: Combined effects of ID mapping and sequential conflicts

### 3. Resolution Strategy Coverage

#### 3.1 Last-Write-Wins (LWW)
- **Well Covered**: Cases 2, 8.5, 9, 10
- **Mechanism**: Timestamp comparison with state transformation
- **Edge Case**: Equal timestamps (not yet covered)

#### 3.2 Deletion Precedence
- **Covered**: Cases 3, 4
- **Rule**: Deletion always wins over updates
- **Challenge**: Ensuring correct state for reversibility

#### 3.3 ID Merging/Mapping
- **Well Covered**: Cases 6, 8, 8.5, 8.6, 11
- **Mechanism**: Map conflicting IDs to canonical ID
- **Challenge**: Propagating ID mappings through operation chains

#### 3.4 Unique Constraint Handling
- **Covered**: Cases 5, 12
- **Strategy**: Remote wins, local item deleted
- **Pattern**: Deterministic conflict resolution

#### 3.5 State Transformation
- **Covered**: Cases 2, 7, 8.6, 10
- **Mechanism**: Update originalItem fields in operations
- **Purpose**: Maintain operation validity after context changes

## Coverage Gaps and Missing Test Cases

### 1. Missing Operation Combinations

#### High Priority
1. **Create (local) vs Delete (remote)**
   - Scenario: Item created locally was deleted on server
   - Expected: Local creation preserved (resurrection)

2. **Create (local) vs SetChecked (remote)**
   - Scenario: Item created locally, checked on server (impossible)
   - Expected: Operation rejected or transformed

3. **Create (remote) vs Rename (local)**
   - Scenario: Server creates item, client tries to rename non-existent item
   - Expected: Local operation rejected

4. **SetChecked vs Delete scenarios**
   - Local: SetChecked, Remote: Delete → Expected: Item deleted
   - Local: Delete, Remote: SetChecked → Expected: Item deleted

5. **Rename (local) vs SetChecked (remote)**
   - Scenario: Simultaneous rename and check operations
   - Expected: Both operations preserved with state transformation

#### Medium Priority
6. **Create vs Rename on different items**
7. **Multiple constraint violations in sequence**
8. **Operations with null/undefined timestamps**

### 2. Complex Scenarios

#### 2.1 Transient Items
- **Pattern**: Items created and deleted within same operation batch
- **Challenge**: Operations on items that don't survive the batch
- **Test Case**: Create→Rename→Delete sequence vs remote operations

#### 2.2 Circular Dependencies
- **Pattern**: A→B, B→C, C→A rename chains
- **Challenge**: Detecting and resolving cycles
- **Test Case**: Complex rename chains with constraint violations

#### 2.3 Deep Operation Chains
- **Pattern**: Long sequences like A→B→C→D→E
- **Challenge**: Maintaining transformation correctness through chain
- **Test Case**: 5+ operation sequence with mixed operation types

### 3. Edge Cases

#### 3.1 Timestamp Edge Cases
1. **Equal Timestamps**
   - **Challenge**: Deterministic tie-breaking
   - **Solution**: Use operation ID or item ID as tiebreaker

2. **Timestamp Ordering Violations**
   - **Challenge**: Operations with impossible timestamp sequences
   - **Solution**: Validation and error handling

#### 3.2 State Consistency
1. **Partial Application Failures**
   - **Challenge**: Maintaining atomicity during rebase
   - **Solution**: Transaction rollback testing

2. **Invalid State Transitions**
   - **Challenge**: Operations that create impossible states
   - **Solution**: Validation and transformation

### 4. Performance and Scale

#### 4.1 Large Batches
- **Test**: 100+ operations in single rebase
- **Metrics**: Performance, memory usage, correctness

#### 4.2 Complex Networks
- **Test**: Multiple clients with overlapping operations
- **Metrics**: Convergence, consistency, performance

## Proposed Test Organization

```typescript
describe('rebase', () => {
  describe('Basic Operation Pairs', () => {
    describe('Create operations', () => {
      it('Create vs Create - ID merging');
      it('Create vs Rename - invalid target');
      it('Create vs Delete - resurrection');
      it('Create vs SetChecked - invalid operation');
    });

    describe('Rename operations', () => {
      it('Rename vs Create - context transformation');
      it('Rename vs Rename - LWW with state update');
      it('Rename vs Delete - operation rejection');
      it('Rename vs SetChecked - independent operations');
    });

    describe('Delete operations', () => {
      it('Delete vs Create - resurrection vs deletion');
      it('Delete vs Rename - deletion precedence');
      it('Delete vs Delete - redundancy elimination');
      it('Delete vs SetChecked - deletion precedence');
    });

    describe('SetChecked operations', () => {
      it('SetChecked vs Create - invalid target handling');
      it('SetChecked vs Rename - state preservation');
      it('SetChecked vs Delete - deletion precedence');
      it('SetChecked vs SetChecked - LWW with timestamps');
    });
  });

  describe('Complex Conflicts', () => {
    describe('ID Mapping Scenarios', () => {
      it('Simple ID merge with subsequent operations');
      it('Multiple ID merges in chain');
      it('ID mapping with constraint violations');
      it('Cross-referenced ID mappings');
    });

    describe('Constraint Violations', () => {
      it('Single unique name violation');
      it('Cascading unique name violations');
      it('Circular constraint dependencies');
      it('Multiple constraints violated simultaneously');
    });

    describe('Sequential Dependencies', () => {
      it('Local operation chain vs remote single');
      it('Single local vs remote operation chain');
      it('Complex bilateral operation chains');
      it('Transient item operations');
    });
  });

  describe('Edge Cases', () => {
    describe('Timestamp Handling', () => {
      it('Equal timestamps - deterministic resolution');
      it('Null/undefined timestamps');
      it('Timestamp ordering violations');
      it('Clock skew scenarios');
    });

    describe('State Consistency', () => {
      it('Invalid state transitions');
      it('Partial application failures');
      it('Operation validation failures');
      it('Recovery from inconsistent state');
    });

    describe('Error Conditions', () => {
      it('Invalid operation payloads');
      it('Missing required fields');
      it('Malformed operation structures');
      it('Database constraint violations');
    });
  });

  describe('Performance and Scale', () => {
    describe('Large Batches', () => {
      it('100 operations - mixed types');
      it('1000 operations - stress test');
      it('Memory usage validation');
      it('Time complexity verification');
    });

    describe('Complex Networks', () => {
      it('Multiple client simulation');
      it('Convergence testing');
      it('Consistency validation');
      it('Byzantine fault tolerance');
    });
  });
});
```

## Priority Implementation Order

### Phase 1: Complete Operation Matrix
1. Fill missing operation combinations (8 test cases)
2. Add timestamp edge cases (3 test cases)
3. Add basic error handling (4 test cases)

### Phase 2: Complex Scenarios
1. Transient item operations (2 test cases)
2. Deep operation chains (3 test cases)
3. Circular dependencies (2 test cases)

### Phase 3: Performance and Scale
1. Large batch testing (3 test cases)
2. Multi-client scenarios (2 test cases)
3. Stress testing (2 test cases)

### Phase 4: Advanced Edge Cases
1. State consistency validation (3 test cases)
2. Recovery scenarios (2 test cases)
3. Byzantine fault scenarios (2 test cases)

## Coverage Metrics

### Current Coverage
- **Operation Pairs**: 10/16 (62.5%)
- **Conflict Types**: 4/4 (100%)
- **Resolution Strategies**: 5/5 (100%)
- **Cardinality Patterns**: 4/4 (100%)
- **Edge Cases**: 2/8 (25%)

### Target Coverage
- **Operation Pairs**: 16/16 (100%)
- **Edge Cases**: 8/8 (100%)
- **Performance Cases**: 5/5 (100%)
- **Error Handling**: 8/8 (100%)

## Conclusion

The current test suite provides excellent coverage of core conflict resolution scenarios but has gaps in:
1. Complete operation matrix coverage
2. Edge case handling (especially timestamps)
3. Error conditions and recovery
4. Performance and scale testing

Implementing the suggested test cases will ensure comprehensive coverage of the sync algorithm's behavior across all scenarios.
