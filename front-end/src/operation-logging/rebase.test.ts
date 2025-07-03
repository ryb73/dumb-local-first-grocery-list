import assert from "node:assert";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
// eslint-disable-next-line @typescript-eslint/no-shadow
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../../db";
import { createMigrator } from "../db/migrations/createMigrator.ts";
import { applyOperation } from "./apply-operation.ts";
import type { Operation } from "./operation-types.ts";
import { rebase } from "./rebase.ts";
import { resolveConflict } from "./resolve-conflict.ts";
import { reverseOperation } from "./reverse-operation.ts";

// Helper functions for creating mock operations
let operationCounter = 0;
let timestampCounter = 1;

function resetCounters() {
  operationCounter = 0;
  timestampCounter = 1;
}

function nextId() {
  return `op-${++operationCounter}`;
}

function nextTimestamp() {
  return timestampCounter++;
}

function createSetCheckedOperation(
  itemId: string,
  checked: boolean,
  options: {
    originalChecked?: boolean;
    originalLastCheckedAt?: number | null;
    newLastCheckedAt?: number;
  } = {}
): Operation {
  const clientCreatedAt = nextTimestamp();

  assert(!checked || options.originalLastCheckedAt !== undefined);

  return {
    clientCreatedAt,
    id: nextId(),
    payload: {
      itemId,
      originalChecked: options.originalChecked ?? !checked,
      originalLastCheckedAt: options.originalLastCheckedAt ?? null,
      ...(checked
        ? {
            checked: true as const,
            newLastCheckedAt: options.newLastCheckedAt ?? clientCreatedAt,
          }
        : { checked: false as const }),
    },
    serverCommittedAt: null,
    type: `setCheckedState`,
  };
}

function createRenameOperation(
  itemId: string,
  newName: string,
  originalName: string
): Operation {
  return {
    clientCreatedAt: nextTimestamp(),
    id: nextId(),
    payload: {
      itemId,
      newName,
      originalName,
    },
    serverCommittedAt: null,
    type: `renameItem`,
  };
}

function createDeleteOperation(
  itemId: string,
  deletedItem: {
    checked: number;
    created_at: number;
    last_checked_at: number | null;
    name: string;
  }
): Operation {
  return {
    clientCreatedAt: nextTimestamp(),
    id: nextId(),
    payload: {
      deletedItem,
      itemId,
    },
    serverCommittedAt: null,
    type: `deleteItem`,
  };
}

async function dumpDb(db: Kysely<DB>) {
  return await db
    .selectFrom(`items`)
    .selectAll()
    .orderBy(`id`, `asc`)
    .execute();
}

describe(`rebase`, () => {
  let db: Kysely<DB> | null = null;

  beforeEach(async () => {
    if (db != null) {
      await db.destroy();
    }

    const kysely = new Kysely<DB>({
      dialect: new SqliteDialect({
        database: new Database(`:memory:`),
      }),
    });
    await createMigrator(kysely).migrateToLatest();

    // eslint-disable-next-line require-atomic-updates
    db = kysely;

    resetCounters();
  });

  it(`Case 1: Independent Operations (Conflict-Free)`, async () => {
    await db!
      .insertInto(`items`)
      .values([
        { id: `A`, name: `Apples`, checked: 0, created_at: nextTimestamp() },
        { id: `B`, name: `Bread`, checked: 0, created_at: nextTimestamp() },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const localOps: Operation[] = [
      createSetCheckedOperation(`A`, true, { originalLastCheckedAt: null }),
    ];
    const remoteOps: Operation[] = [
      createRenameOperation(`B`, `Whole Wheat Bread`, `Bread`),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      idMap: {},
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 3,
          "id": "op-1",
          "payload": {
            "checked": true,
            "itemId": "A",
            "newLastCheckedAt": 3,
            "originalChecked": false,
            "originalLastCheckedAt": null,
          },
          "serverCommittedAt": null,
          "type": "setCheckedState",
        },
      ]
    `);

    const allAppliedOps = [...remoteOps, ...rebasedOps];

    for (const op of allAppliedOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }

    const stateAfterAllApplied = await dumpDb(db!);

    expect(stateAfterAllApplied).toMatchInlineSnapshot(`
      [
        {
          "checked": 1,
          "created_at": 1,
          "id": "A",
          "last_checked_at": 3,
          "name": "Apples",
        },
        {
          "checked": 0,
          "created_at": 2,
          "id": "B",
          "last_checked_at": null,
          "name": "Whole Wheat Bread",
        },
      ]
    `);

    for (const op of allAppliedOps.slice().reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await reverseOperation(db!, op);
    }

    const revertedState = await dumpDb(db!);

    expect(revertedState).toEqual(initialState);
  });

  it(`Case 2: Direct Conflict (LWW on Rename)`, async () => {
    await db!
      .insertInto(`items`)
      .values([
        { id: `A`, name: `Milk`, checked: 0, created_at: nextTimestamp() },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const remoteOps: Operation[] = [
      createRenameOperation(`A`, `Oat Milk`, `Milk`),
    ];
    const localOps: Operation[] = [
      createRenameOperation(`A`, `Almond Milk`, `Milk`),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      idMap: {},
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 3,
          "id": "op-2",
          "payload": {
            "itemId": "A",
            "newName": "Almond Milk",
            "originalName": "Oat Milk",
          },
          "serverCommittedAt": null,
          "type": "renameItem",
        },
      ]
    `);

    const allAppliedOps = [...remoteOps, ...rebasedOps];

    for (const op of allAppliedOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }

    const stateAfterAllApplied = await dumpDb(db!);

    expect(stateAfterAllApplied).toMatchInlineSnapshot(`
      [
        {
          "checked": 0,
          "created_at": 1,
          "id": "A",
          "last_checked_at": null,
          "name": "Almond Milk",
        },
      ]
    `);

    for (const op of allAppliedOps.slice().reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await reverseOperation(db!, op);
    }

    const revertedState = await dumpDb(db!);

    expect(revertedState).toEqual(initialState);
  });

  it(`Case 3: Local Deletion vs. Remote Update`, async () => {
    const clientCreatedAt = nextTimestamp();
    await db!
      .insertInto(`items`)
      .values([
        { id: `X`, name: `Coffee`, checked: 0, created_at: clientCreatedAt },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const localOps: Operation[] = [
      createDeleteOperation(`X`, {
        checked: 0,
        created_at: clientCreatedAt,
        last_checked_at: null,
        name: `Coffee`,
      }),
    ];
    const remoteOps: Operation[] = [
      createSetCheckedOperation(`X`, true, { originalLastCheckedAt: null }),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      idMap: {},
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 2,
          "id": "op-1",
          "payload": {
            "deletedItem": {
              "checked": 0,
              "created_at": 1,
              "last_checked_at": null,
              "name": "Coffee",
            },
            "itemId": "X",
          },
          "serverCommittedAt": null,
          "type": "deleteItem",
        },
      ]
    `);

    const allAppliedOps = [...remoteOps, ...rebasedOps];

    for (const op of allAppliedOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }

    const stateAfterAllApplied = await dumpDb(db!);

    expect(stateAfterAllApplied).toMatchInlineSnapshot(`[]`);

    for (const op of allAppliedOps.slice().reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await reverseOperation(db!, op);
    }

    const revertedState = await dumpDb(db!);

    expect(revertedState).toEqual(initialState);
  });
});
