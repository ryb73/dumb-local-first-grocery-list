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
  });

  it(`Case 1: Independent Operations (Conflict-Free)`, async () => {
    const T1 = 1;
    const T2 = T1 + 1000;

    await db!
      .insertInto(`items`)
      .values([
        { id: `A`, name: `Apples`, checked: 0, created_at: T1 - 100 },
        { id: `B`, name: `Bread`, checked: 0, created_at: T1 - 100 },
      ])
      .execute();

    const initialState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    const localOps: Operation[] = [
      {
        clientCreatedAt: T1,
        id: `local-op-1`,
        payload: {
          checked: true,
          itemId: `A`,
          newLastCheckedAt: T1,
          originalChecked: false,
          originalLastCheckedAt: null,
        },
        serverCommittedAt: null,
        type: `setCheckedState`,
      },
    ];
    const remoteOps: Operation[] = [
      {
        clientCreatedAt: T2,
        id: `remote-op-1`,
        payload: {
          itemId: `B`,
          newName: `Whole Wheat Bread`,
          originalName: `Bread`,
        },
        serverCommittedAt: null,
        type: `renameItem`,
      },
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      idMap: {},
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 1,
          "id": "local-op-1",
          "payload": {
            "checked": true,
            "itemId": "A",
            "newLastCheckedAt": 1,
            "originalChecked": false,
            "originalLastCheckedAt": null,
          },
          "serverCommittedAt": null,
          "type": "setCheckedState",
        },
      ]
    `);

    for (const op of remoteOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }
    for (const op of rebasedOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }

    const finalState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    expect(finalState).toMatchInlineSnapshot(`
      [
        {
          "checked": 1,
          "created_at": -99,
          "id": "A",
          "last_checked_at": 1,
          "name": "Apples",
        },
        {
          "checked": 0,
          "created_at": -99,
          "id": "B",
          "last_checked_at": null,
          "name": "Whole Wheat Bread",
        },
      ]
    `);

    const allAppliedOps = [...remoteOps, ...rebasedOps];

    for (const op of allAppliedOps.slice().reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await reverseOperation(db!, op);
    }

    const revertedState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    expect(revertedState).toEqual(initialState);
  });

  it(`Case 2: Direct Conflict (LWW on Rename)`, async () => {
    const T1 = 1;
    const T2 = T1 + 1000;

    await db!
      .insertInto(`items`)
      .values([{ id: `A`, name: `Milk`, checked: 0, created_at: T1 - 100 }])
      .execute();

    const initialState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    const localOps: Operation[] = [
      {
        clientCreatedAt: T2,
        id: `local-op-1`,
        payload: {
          itemId: `A`,
          newName: `Almond Milk`,
          originalName: `Milk`,
        },
        serverCommittedAt: null,
        type: `renameItem`,
      },
    ];
    const remoteOps: Operation[] = [
      {
        clientCreatedAt: T1,
        id: `remote-op-1`,
        payload: {
          itemId: `A`,
          newName: `Oat Milk`,
          originalName: `Milk`,
        },
        serverCommittedAt: null,
        type: `renameItem`,
      },
    ];
    const rebasedOps = rebase(localOps, remoteOps, resolveConflict, {
      idMap: {},
    });

    expect(rebasedOps).toMatchInlineSnapshot(`
      [
        {
          "clientCreatedAt": 1001,
          "id": "local-op-1",
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

    for (const op of remoteOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }
    for (const op of rebasedOps) {
      // eslint-disable-next-line no-await-in-loop
      await applyOperation(db!, op);
    }

    const finalState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    expect(finalState).toMatchInlineSnapshot(`
      [
        {
          "checked": 0,
          "created_at": -99,
          "id": "A",
          "last_checked_at": null,
          "name": "Almond Milk",
        },
      ]
    `);

    const allAppliedOps = [...remoteOps, ...rebasedOps];

    for (const op of allAppliedOps.slice().reverse()) {
      // eslint-disable-next-line no-await-in-loop
      await reverseOperation(db!, op);
    }

    const revertedState = await db!
      .selectFrom(`items`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    expect(revertedState).toEqual(initialState);
  });
});
