import assert from "node:assert";
import Database from "better-sqlite3";
import { Kysely, SqliteDialect } from "kysely";
import {
  /* eslint-disable @typescript-eslint/no-shadow */
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  /* eslint-enable @typescript-eslint/no-shadow */
} from "vitest";
import type { DB } from "../../db";
import { createMigrator } from "../db/migrations/createMigrator.ts";
import { applyOperation } from "./apply-operation.ts";
import type {
  CreateItemOperation,
  DeleteItemOperation,
  RenameItemOperation,
  SetCheckedStateOperation,
} from "./operation-types.ts";
import { rebase } from "./rebase.ts";
import { resolveConflict } from "./resolve-conflict.ts";
import { reverseOperation } from "./reverse-operation.ts";

// Helper functions for creating mock operations
let operationCounter = 0;
let timestampCounter = 1;
let uuidCounter = 0;

function resetCounters() {
  operationCounter = 0;
  timestampCounter = 1;
  uuidCounter = 0;
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
): SetCheckedStateOperation {
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
  originalItem: {
    checked: number;
    created_at: number;
    last_checked_at: number | null;
    name: string;
  }
): RenameItemOperation {
  return {
    clientCreatedAt: nextTimestamp(),
    id: nextId(),
    payload: {
      itemId,
      newName,
      originalItem,
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
): DeleteItemOperation {
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

function createCreateItemOperation(
  id: string,
  name: string
): CreateItemOperation {
  const clientCreatedAt = nextTimestamp();
  return {
    clientCreatedAt,
    id: nextId(),
    payload: {
      item: {
        created_at: clientCreatedAt,
        id,
        name,
      },
    },
    serverCommittedAt: null,
    type: `createItem`,
  };
}

async function dumpDb(db: Kysely<DB>) {
  return await db
    .selectFrom(`items`)
    .selectAll()
    .orderBy(`id`, `asc`)
    .execute();
}

beforeAll(() => {
  vi.stubGlobal(`crypto`, {
    randomUUID: vi.fn(() => `uuid-${++uuidCounter}`),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

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
    const createdAt = [nextTimestamp(), nextTimestamp()];
    await db!
      .insertInto(`items`)
      .values([
        { id: `A`, name: `Apples`, checked: 0, created_at: createdAt[0] },
        { id: `B`, name: `Bread`, checked: 0, created_at: createdAt[1] },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const localOps = [
      createSetCheckedOperation(`A`, true, { originalLastCheckedAt: null }),
    ];
    const remoteOps = [
      createRenameOperation(`B`, `Whole Wheat Bread`, {
        checked: 0,
        created_at: createdAt[1]!,
        last_checked_at: null,
        name: `Bread`,
      }),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
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
    const itemCreatedAt = nextTimestamp();

    await db!
      .insertInto(`items`)
      .values([
        { id: `A`, name: `Milk`, checked: 0, created_at: itemCreatedAt },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const remoteOps = [
      createRenameOperation(`A`, `Oat Milk`, {
        checked: 0,
        created_at: itemCreatedAt,
        last_checked_at: null,
        name: `Milk`,
      }),
    ];
    const localOps = [
      createRenameOperation(`A`, `Almond Milk`, {
        checked: 0,
        created_at: itemCreatedAt,
        last_checked_at: null,
        name: `Milk`,
      }),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 3,
          "id": "op-2",
          "payload": {
            "itemId": "A",
            "newName": "Almond Milk",
            "originalItem": {
              "checked": 0,
              "created_at": 1,
              "last_checked_at": null,
              "name": "Oat Milk",
            },
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

    const localOps = [
      createDeleteOperation(`X`, {
        checked: 0,
        created_at: clientCreatedAt,
        last_checked_at: null,
        name: `Coffee`,
      }),
    ];
    const remoteOps = [
      createSetCheckedOperation(`X`, true, { originalLastCheckedAt: null }),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
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

  it(`Case 4: Remote Deletion vs. Local Update`, async () => {
    const itemCreatedAt = nextTimestamp();

    await db!
      .insertInto(`items`)
      .values([
        { id: `Y`, name: `Yogurt`, checked: 0, created_at: itemCreatedAt },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const remoteOps = [
      createDeleteOperation(`Y`, {
        checked: 0,
        created_at: itemCreatedAt,
        last_checked_at: null,
        name: `Yogurt`,
      }),
    ];
    const localOps = [
      createRenameOperation(`Y`, `Greek Yogurt`, {
        checked: 0,
        created_at: itemCreatedAt,
        last_checked_at: null,
        name: `Yogurt`,
      }),
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`[]`);

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

  it(`Case 5: Renaming to same name, violating uniqueness`, async () => {
    const itemsCreatedAt = [nextTimestamp(), nextTimestamp()];

    await db!
      .insertInto(`items`)
      .values([
        { id: `X`, name: `Oranges`, checked: 0, created_at: itemsCreatedAt[0] },
        { id: `Y`, name: `Pears`, checked: 0, created_at: itemsCreatedAt[1] },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    // T1 - will conflict with remote op (T2)
    const localOp1 = createRenameOperation(`X`, `Apples`, {
      checked: 0,
      created_at: itemsCreatedAt[0]!,
      last_checked_at: null,
      name: `Oranges`,
    });
    // T2 - conflicts with first local op
    const remoteOp = createRenameOperation(`Y`, `Apples`, {
      checked: 0,
      created_at: itemsCreatedAt[1]!,
      last_checked_at: null,
      name: `Pears`,
    });
    // T3 - will be invalid after X is deleted
    const localOp2 = createRenameOperation(`X`, `Bananas`, {
      checked: 0,
      created_at: itemsCreatedAt[0]!,
      last_checked_at: null,
      name: `Apples`,
    });

    const localOps = [localOp1, localOp2];
    const remoteOps = [remoteOp];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 3,
          "id": "uuid-1",
          "payload": {
            "deletedItem": {
              "checked": 0,
              "created_at": 1,
              "last_checked_at": null,
              "name": "Oranges",
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

    expect(stateAfterAllApplied).toMatchInlineSnapshot(`
      [
        {
          "checked": 0,
          "created_at": 2,
          "id": "Y",
          "last_checked_at": null,
          "name": "Apples",
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

  it(`Case 5.5: renaming to same name, violating uniqueness, but with a different item`, async () => {
    const itemsCreatedAt = [nextTimestamp(), nextTimestamp()];
    const lastCheckedAt = nextTimestamp();

    await db!
      .insertInto(`items`)
      .values([
        {
          checked: 1,
          created_at: itemsCreatedAt[0],
          id: `X`,
          last_checked_at: lastCheckedAt,
          name: `Oranges`,
        },
        { id: `Y`, name: `Pears`, checked: 0, created_at: itemsCreatedAt[1] },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    // T1 - will conflict with remote op (T2)
    const localOp1 = createRenameOperation(`X`, `Apples`, {
      checked: 1,
      created_at: itemsCreatedAt[0]!,
      last_checked_at: lastCheckedAt,
      name: `Oranges`,
    });
    // T2 - conflicts with first local op
    const remoteOp = createRenameOperation(`Y`, `Apples`, {
      checked: 0,
      created_at: itemsCreatedAt[1]!,
      last_checked_at: null,
      name: `Pears`,
    });
    // T3 - will be invalid after X is deleted
    const localOp2 = createRenameOperation(`X`, `Bananas`, {
      checked: 0,
      created_at: itemsCreatedAt[0]!,
      last_checked_at: null,
      name: `Apples`,
    });

    const localOps = [localOp1, localOp2];
    const remoteOps = [remoteOp];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 4,
          "id": "uuid-1",
          "payload": {
            "deletedItem": {
              "checked": 1,
              "created_at": 1,
              "last_checked_at": 3,
              "name": "Oranges",
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

    expect(stateAfterAllApplied).toMatchInlineSnapshot(`
      [
        {
          "checked": 0,
          "created_at": 2,
          "id": "Y",
          "last_checked_at": null,
          "name": "Apples",
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

  it(`Case 6: Simple Creation Conflict`, async () => {
    const initialState = await dumpDb(db!);

    const localOps = [createCreateItemOperation(`uuid-local`, `Cheese`)];
    const remoteOps = [createCreateItemOperation(`uuid-remote`, `Cheese`)];

    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`[]`);

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
          "created_at": 2,
          "id": "uuid-remote",
          "last_checked_at": null,
          "name": "Cheese",
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

  it(`Case 7: Sequential Local Toggles vs. Remote Rename`, async () => {
    const itemCreatedAt = nextTimestamp();
    await db!
      .insertInto(`items`)
      .values([
        {
          checked: 0,
          created_at: itemCreatedAt,
          id: `A`,
          last_checked_at: null,
          name: `Apples`,
        },
      ])
      .execute();

    const initialState = await dumpDb(db!);

    const localOp1 = createSetCheckedOperation(`A`, true, {
      originalLastCheckedAt: null,
    });

    const remoteOp = createRenameOperation(`A`, `Green Apples`, {
      checked: 0,
      created_at: itemCreatedAt,
      last_checked_at: null,
      name: `Apples`,
    });

    const localOp2 = createSetCheckedOperation(`A`, false, {
      originalLastCheckedAt: localOp1.clientCreatedAt,
    });

    const localOps = [localOp1, localOp2];
    const remoteOps = [remoteOp];

    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 2,
          "id": "op-1",
          "payload": {
            "checked": true,
            "itemId": "A",
            "newLastCheckedAt": 2,
            "originalChecked": false,
            "originalLastCheckedAt": null,
          },
          "serverCommittedAt": null,
          "type": "setCheckedState",
        },
        {
          "clientCreatedAt": 4,
          "id": "op-3",
          "payload": {
            "checked": false,
            "itemId": "A",
            "originalChecked": true,
            "originalLastCheckedAt": 2,
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
          "checked": 0,
          "created_at": 1,
          "id": "A",
          "last_checked_at": 2,
          "name": "Green Apples",
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

  it(`Case 8: Advanced Creation Conflict with ID Merging`, async () => {
    const initialState = await dumpDb(db!);

    const localOp1 = createCreateItemOperation(`uuid-local`, `Cheese`);
    const remoteOps = [createCreateItemOperation(`uuid-remote`, `Cheese`)];

    const localOp2 = createRenameOperation(`uuid-local`, `Cheddar`, {
      created_at: localOp1.payload.item.created_at!,
      name: `Cheese`,
      checked: 0,
      last_checked_at: null,
    });

    const localOps = [localOp1, localOp2];

    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 3,
          "id": "op-3",
          "payload": {
            "itemId": "uuid-remote",
            "newName": "Cheddar",
            "originalItem": {
              "checked": 0,
              "created_at": 2,
              "last_checked_at": null,
              "name": "Cheese",
            },
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
          "created_at": 2,
          "id": "uuid-remote",
          "last_checked_at": null,
          "name": "Cheddar",
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

  it(`Case 8.5: Complex ID Merging and Conflicting Renames (LWW)`, async () => {
    const initialState = await dumpDb(db!);

    const localOp1 = createCreateItemOperation(`uuid-local`, `Milk`);

    const remoteOp1 = createCreateItemOperation(`uuid-remote`, `Milk`);

    const remoteOp2 = createRenameOperation(`uuid-remote`, `Skim Milk`, {
      created_at: remoteOp1.payload.item.created_at!,
      name: `Milk`,
      checked: 0,
      last_checked_at: null,
    });

    const localOp2 = createRenameOperation(`uuid-local`, `Whole Milk`, {
      created_at: localOp1.payload.item.created_at!,
      name: `Milk`,
      checked: 0,
      last_checked_at: null,
    });

    const localOps = [localOp1, localOp2];
    const remoteOps = [remoteOp1, remoteOp2];

    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      newEffectiveIdsByOldId: new Map(),
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 4,
          "id": "op-4",
          "payload": {
            "itemId": "uuid-remote",
            "newName": "Whole Milk",
            "originalItem": {
              "checked": 0,
              "created_at": 2,
              "last_checked_at": null,
              "name": "Skim Milk",
            },
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
          "created_at": 2,
          "id": "uuid-remote",
          "last_checked_at": null,
          "name": "Whole Milk",
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
});
