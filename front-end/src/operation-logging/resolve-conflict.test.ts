// eslint-disable-next-line @typescript-eslint/no-shadow
import { describe, expect, it } from "vitest";
import type { Operation } from "./operation-types";
import { resolveConflict } from "./resolve-conflict";

describe(`resolveConflict`, () => {
  // Helper to create operations with minimal required fields
  const createOp = (
    overrides: Partial<Operation> & { type: Operation["type"] }
  ): Operation => {
    const base = {
      id: `op-${Math.random()}`,
      clientCreatedAt: Date.now(),
      serverCommittedAt: null,
    };

    switch (overrides.type) {
      case `createItem`:
        return {
          ...base,
          ...overrides,
          type: `createItem`,
          payload: {
            item: {
              checked: 0,
              created_at: Date.now(),
              id: `item-1`,
              last_unchecked_at: null,
              name: `Test Item`,
            },
            ...overrides.payload,
          },
        } as Operation;

      case `setItemChecked`:
        return {
          ...base,
          ...overrides,
          type: `setItemChecked`,
          payload: {
            itemId: `item-1`,
            ...overrides.payload,
          },
        } as Operation;

      case `setItemUnchecked`:
        return {
          ...base,
          ...overrides,
          type: `setItemUnchecked`,
          payload: {
            itemId: `item-1`,
            newLastUncheckedAt: Date.now(),
            originalLastUncheckedAt: null,
            ...overrides.payload,
          },
        } as Operation;

      case `renameItem`:
        return {
          ...base,
          ...overrides,
          type: `renameItem`,
          payload: {
            itemId: `item-1`,
            newName: `New Name`,
            originalName: `Old Name`,
            ...overrides.payload,
          },
        } as Operation;

      default:
        throw new Error(`Unknown operation type: ${(overrides as any).type}`);
    }
  };

  describe(`identical operations`, () => {
    it(`should discard local operation when IDs are identical`, () => {
      const opId = `identical-op`;
      const remoteOp = createOp({ type: `createItem`, id: opId });
      const localOp = createOp({ type: `createItem`, id: opId });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toMatchInlineSnapshot(`[]`);
    });
  });

  describe(`createItem conflicts`, () => {
    it(`should keep local createItem when it's newer than remote createItem for same ID`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `createItem`,
        clientCreatedAt: 1000,
        payload: { item: { id: itemId } as any },
      });
      const localOp = createOp({
        type: `createItem`,
        clientCreatedAt: 2000,
        payload: { item: { id: itemId } as any },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should discard local createItem when it's older than remote createItem for same ID`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `createItem`,
        clientCreatedAt: 2000,
        payload: { item: { id: itemId } as any },
      });
      const localOp = createOp({
        type: `createItem`,
        clientCreatedAt: 1000,
        payload: { item: { id: itemId } as any },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toMatchInlineSnapshot(`[]`);
    });

    it(`should keep local createItem when item IDs are different`, () => {
      const remoteOp = createOp({
        type: `createItem`,
        payload: { item: { id: `item-1` } as any },
      });
      const localOp = createOp({
        type: `createItem`,
        payload: { item: { id: `item-2` } as any },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should keep local modification operations on newly created item`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `createItem`,
        payload: { item: { id: itemId } as any },
      });
      const localOp = createOp({
        type: `setItemChecked`,
        payload: { itemId },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });
  });

  describe(`setItemChecked conflicts`, () => {
    it(`should discard local setItemChecked when remote also checks same item`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemChecked`,
        payload: { itemId },
      });
      const localOp = createOp({
        type: `setItemChecked`,
        payload: { itemId },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toMatchInlineSnapshot(`[]`);
    });

    it(`should use last-write-wins for setItemChecked vs setItemUnchecked`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemChecked`,
        clientCreatedAt: 1000,
        payload: { itemId },
      });
      const localOp = createOp({
        type: `setItemUnchecked`,
        clientCreatedAt: 2000,
        payload: {
          itemId,
          newLastUncheckedAt: 2000,
          originalLastUncheckedAt: null,
        },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should discard local setItemUnchecked when remote setItemChecked is newer`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemChecked`,
        clientCreatedAt: 2000,
        payload: { itemId },
      });
      const localOp = createOp({
        type: `setItemUnchecked`,
        clientCreatedAt: 1000,
        payload: {
          itemId,
          newLastUncheckedAt: 1000,
          originalLastUncheckedAt: null,
        },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toMatchInlineSnapshot(`[]`);
    });

    it(`should keep local renameItem when remote setItemChecked (no conflict)`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemChecked`,
        payload: { itemId },
      });
      const localOp = createOp({
        type: `renameItem`,
        payload: { itemId, newName: `New Name`, originalName: `Old Name` },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });
  });

  describe(`setItemUnchecked conflicts`, () => {
    it(`should use timestamp comparison for competing setItemUnchecked operations`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemUnchecked`,
        payload: {
          itemId,
          newLastUncheckedAt: 1000,
          originalLastUncheckedAt: null,
        },
      });
      const localOp = createOp({
        type: `setItemUnchecked`,
        payload: {
          itemId,
          newLastUncheckedAt: 2000,
          originalLastUncheckedAt: null,
        },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should discard local setItemUnchecked when remote has newer timestamp`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemUnchecked`,
        payload: {
          itemId,
          newLastUncheckedAt: 2000,
          originalLastUncheckedAt: null,
        },
      });
      const localOp = createOp({
        type: `setItemUnchecked`,
        payload: {
          itemId,
          newLastUncheckedAt: 1000,
          originalLastUncheckedAt: null,
        },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toMatchInlineSnapshot(`[]`);
    });

    it(`should use last-write-wins for setItemUnchecked vs setItemChecked`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `setItemUnchecked`,
        clientCreatedAt: 1000,
        payload: {
          itemId,
          newLastUncheckedAt: 1000,
          originalLastUncheckedAt: null,
        },
      });
      const localOp = createOp({
        type: `setItemChecked`,
        clientCreatedAt: 2000,
        payload: { itemId },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });
  });

  describe(`renameItem conflicts`, () => {
    it(`should use last-write-wins for competing rename operations`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `renameItem`,
        clientCreatedAt: 1000,
        payload: { itemId, newName: `Remote Name`, originalName: `Old Name` },
      });
      const localOp = createOp({
        type: `renameItem`,
        clientCreatedAt: 2000,
        payload: { itemId, newName: `Local Name`, originalName: `Old Name` },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should use operation ID as tiebreaker when timestamps are equal`, () => {
      const itemId = `same-item`;
      const timestamp = 1000;
      const remoteOp = createOp({
        type: `renameItem`,
        id: `a-remote-op`,
        clientCreatedAt: timestamp,
        payload: { itemId, newName: `Remote Name`, originalName: `Old Name` },
      });
      const localOp = createOp({
        type: `renameItem`,
        id: `z-local-op`,
        clientCreatedAt: timestamp,
        payload: { itemId, newName: `Local Name`, originalName: `Old Name` },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });

    it(`should keep local check/uncheck operations when remote renames (no conflict)`, () => {
      const itemId = `same-item`;
      const remoteOp = createOp({
        type: `renameItem`,
        payload: { itemId, newName: `New Name`, originalName: `Old Name` },
      });
      const localOp = createOp({
        type: `setItemChecked`,
        payload: { itemId },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });
  });

  describe(`operations on different items`, () => {
    it(`should keep local operation when operating on different items`, () => {
      const remoteOp = createOp({
        type: `setItemChecked`,
        payload: { itemId: `item-1` },
      });
      const localOp = createOp({
        type: `setItemChecked`,
        payload: { itemId: `item-2` },
      });

      const result = resolveConflict(remoteOp, localOp);

      expect(result).toEqual([localOp]);
    });
  });
});
