import Database from "better-sqlite3";
import { Kysely, Migrator, SqliteDialect } from "kysely";
// eslint-disable-next-line @typescript-eslint/no-shadow
import { beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../../../../operation-log-db";
import { devOperationLogMigrations } from "./operation-log-migrations.ts";

describe(`createItem payload migration (2025-08-19_01)`, () => {
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

    // Get all migrations except our target migration
    const allMigrations = Object.entries(devOperationLogMigrations);
    const targetMigrationKey = `2025-08-19_01`;

    // Run only migrations that come before our target migration
    const preMigrations = Object.fromEntries(
      allMigrations.filter(([key]) => key.localeCompare(targetMigrationKey) < 0)
    );

    const preMigrator = new Migrator({
      db: kysely,
      provider: {
        getMigrations: () => Promise.resolve(preMigrations),
      },
    });

    await preMigrator.migrateToLatest();

    // eslint-disable-next-line require-atomic-updates
    db = kysely;
  });

  it(`should migrate createItem payloads from created_at to createdAt`, async () => {
    // Insert test data with OLD format (snake_case)
    await db!
      .insertInto(`operations`)
      .values([
        {
          client_created_at: 1_642_694_400_000,
          id: `old-format-1`,
          payload: JSON.stringify({
            item: {
              created_at: 1_642_694_400_000, // OLD format
              id: `item-123`,
              name: `Test Item`,
            },
          }),
          server_committed_at: null,
          type: `createItem`,
        },
        {
          client_created_at: 1_642_694_500_000,
          id: `already-new-1`,
          payload: JSON.stringify({
            item: {
              createdAt: 1_642_694_500_000, // Already NEW format
              id: `item-456`,
              name: `Another Item`,
            },
          }),
          server_committed_at: null,
          type: `createItem`,
        },
        {
          client_created_at: 1_642_694_600_000,
          id: `not-createitem-1`,
          payload: JSON.stringify({
            itemId: `item-123`,
            checked: true,
          }),
          server_committed_at: null,
          type: `setCheckedState`, // Different operation type
        },
      ])
      .execute();

    // Get our target migration
    const targetMigration = devOperationLogMigrations[`2025-08-19_01`]!;

    // Run the UP migration
    await targetMigration.up(db!);

    // Verify transformations
    const afterUp = await db!
      .selectFrom(`operations`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    // Find the record that was in old format
    const oldFormatRecord = afterUp.find((row) => row.id === `old-format-1`)!;
    const oldFormatResult = JSON.parse(oldFormatRecord.payload);
    expect(oldFormatResult).toMatchInlineSnapshot(`
       {
         "item": {
           "createdAt": 1642694400000,
           "id": "item-123",
           "name": "Test Item",
         },
       }
     `);

    // Check already-new format wasn't touched
    const alreadyNewRecord = afterUp.find((row) => row.id === `already-new-1`)!;
    const alreadyNewResult = JSON.parse(alreadyNewRecord.payload);
    expect(alreadyNewResult).toMatchInlineSnapshot(`
       {
         "item": {
           "createdAt": 1642694500000,
           "id": "item-456",
           "name": "Another Item",
         },
       }
     `);

    // Check non-createItem operations weren't touched
    const nonCreateItemRecord = afterUp.find(
      (row) => row.id === `not-createitem-1`
    )!;
    const nonCreateItemResult = JSON.parse(nonCreateItemRecord.payload);
    expect(nonCreateItemResult).toMatchInlineSnapshot(`
       {
         "checked": true,
         "itemId": "item-123",
       }
     `);
  });

  it(`should rollback createItem payloads from createdAt to created_at`, async () => {
    // Insert test data with NEW format (camelCase)
    await db!
      .insertInto(`operations`)
      .values([
        {
          client_created_at: 1_642_694_400_000,
          id: `new-format-1`,
          payload: JSON.stringify({
            item: {
              createdAt: 1_642_694_400_000, // NEW format
              id: `item-rollback`,
              name: `Rollback Test`,
            },
          }),
          server_committed_at: null,
          type: `createItem`,
        },
      ])
      .execute();

    const targetMigration = devOperationLogMigrations[`2025-08-19_01`]!;

    // Run the DOWN migration (rollback)
    await targetMigration.down!(db!);

    // Verify rollback
    const afterDown = await db!
      .selectFrom(`operations`)
      .selectAll()
      .where(`id`, `=`, `new-format-1`)
      .execute();

    const rolledBackResult = JSON.parse(afterDown[0]!.payload);
    expect(rolledBackResult).toMatchInlineSnapshot(`
      {
        "item": {
          "created_at": 1642694400000,
          "id": "item-rollback",
          "name": "Rollback Test",
        },
      }
    `);
  });

  it(`should fail gracefully on invalid JSON`, async () => {
    // Insert test data with invalid JSON
    await db!
      .insertInto(`operations`)
      .values([
        {
          client_created_at: 1_642_694_400_000,
          id: `invalid-json-1`,
          payload: `invalid-json-string`,
          server_committed_at: null,
          type: `createItem`,
        },
      ])
      .execute();

    const targetMigration = devOperationLogMigrations[`2025-08-19_01`]!;

    // Should throw an error (since we removed try/catch)
    await expect(targetMigration.up(db!)).rejects.toThrow();
  });

  it(`should handle round-trip conversion correctly`, async () => {
    // Test that up() then down() gets back to original state
    await db!
      .insertInto(`operations`)
      .values([
        {
          client_created_at: 1_642_694_400_000,
          id: `round-trip-1`,
          payload: JSON.stringify({
            item: {
              created_at: 1_642_694_400_000, // Start with OLD format
              id: `item-round-trip`,
              name: `Round Trip Test`,
            },
          }),
          server_committed_at: null,
          type: `createItem`,
        },
      ])
      .execute();

    const targetMigration = devOperationLogMigrations[`2025-08-19_01`]!;

    // Run UP migration
    await targetMigration.up(db!);

    // Verify it's in new format
    let result = await db!
      .selectFrom(`operations`)
      .select(`payload`)
      .where(`id`, `=`, `round-trip-1`)
      .executeTakeFirstOrThrow();

    let payload = JSON.parse(result.payload);
    expect(payload).toMatchInlineSnapshot(`
      {
        "item": {
          "createdAt": 1642694400000,
          "id": "item-round-trip",
          "name": "Round Trip Test",
        },
      }
    `);

    // Run DOWN migration
    await targetMigration.down!(db!);

    // Verify it's back to old format
    result = await db!
      .selectFrom(`operations`)
      .select(`payload`)
      .where(`id`, `=`, `round-trip-1`)
      .executeTakeFirstOrThrow();

    payload = JSON.parse(result.payload);
    expect(payload).toMatchInlineSnapshot(`
      {
        "item": {
          "created_at": 1642694400000,
          "id": "item-round-trip",
          "name": "Round Trip Test",
        },
      }
    `);
  });

  it(`should only affect createItem operations`, async () => {
    // Insert various operation types
    await db!
      .insertInto(`operations`)
      .values([
        {
          client_created_at: 1_642_694_400_000,
          id: `createitem-op`,
          payload: JSON.stringify({
            item: {
              created_at: 1_642_694_400_000,
              id: `item-1`,
              name: `Create Item`,
            },
          }),
          server_committed_at: null,
          type: `createItem`,
        },
        {
          client_created_at: 1_642_694_500_000,
          id: `rename-op`,
          payload: JSON.stringify({
            itemId: `item-1`,
            newName: `New Name`,
            originalItem: {
              created_at: 1_642_694_400_000, // This should NOT be changed
              name: `Old Name`,
              checked: false,
              lastCheckedAt: null,
            },
          }),
          server_committed_at: null,
          type: `renameItem`,
        },
        {
          client_created_at: 1_642_694_600_000,
          id: `delete-op`,
          payload: JSON.stringify({
            itemId: `item-1`,
            deletedItem: {
              created_at: 1_642_694_400_000, // This should NOT be changed
              name: `Deleted Item`,
              checked: false,
              lastCheckedAt: null,
            },
          }),
          server_committed_at: null,
          type: `deleteItem`,
        },
      ])
      .execute();

    const targetMigration = devOperationLogMigrations[`2025-08-19_01`]!;

    // Run the UP migration
    await targetMigration.up(db!);

    // Verify only createItem operation was changed
    const afterMigration = await db!
      .selectFrom(`operations`)
      .selectAll()
      .orderBy(`id`, `asc`)
      .execute();

    // createItem should be converted
    const createItemRecord = afterMigration.find(
      (row) => row.id === `createitem-op`
    )!;
    const createItemPayload = JSON.parse(createItemRecord.payload);
    expect(createItemPayload).toMatchInlineSnapshot(`
      {
        "item": {
          "createdAt": 1642694400000,
          "id": "item-1",
          "name": "Create Item",
        },
      }
    `);

    // renameItem should be unchanged (created_at should still exist in originalItem)
    const renameItemRecord = afterMigration.find(
      (row) => row.id === `rename-op`
    )!;
    const renameItemPayload = JSON.parse(renameItemRecord.payload);
    expect(renameItemPayload).toMatchInlineSnapshot(`
      {
        "itemId": "item-1",
        "newName": "New Name",
        "originalItem": {
          "checked": false,
          "created_at": 1642694400000,
          "lastCheckedAt": null,
          "name": "Old Name",
        },
      }
    `);

    // deleteItem should be unchanged (created_at should still exist in deletedItem)
    const deleteItemRecord = afterMigration.find(
      (row) => row.id === `delete-op`
    )!;
    const deleteItemPayload = JSON.parse(deleteItemRecord.payload);
    expect(deleteItemPayload).toMatchInlineSnapshot(`
      {
        "deletedItem": {
          "checked": false,
          "created_at": 1642694400000,
          "lastCheckedAt": null,
          "name": "Deleted Item",
        },
        "itemId": "item-1",
      }
    `);
  });
});
