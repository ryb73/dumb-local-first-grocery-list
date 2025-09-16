import { existsSync, unlinkSync } from "fs";
import { initMergedDatabase } from "@grocery-list/shared";
import type { MergedDB } from "@grocery-list/shared";
import Database from "better-sqlite3";
import type { Kysely } from "kysely";
import { SqliteDialect } from "kysely";
// eslint-disable-next-line @typescript-eslint/no-shadow
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe(`Merged Database`, () => {
  let mergedKysely: Kysely<MergedDB> | null;
  const testMainDbName = `test-grocery-list.sqlite3`;
  const testOperationLogDbName = `test-grocery-list.log.sqlite3`;

  beforeEach(async () => {
    // Create dialects for testing using better-sqlite3
    const mainDialect = new SqliteDialect({
      database: new Database(testMainDbName),
    });

    const operationLogDialect = new SqliteDialect({
      database: new Database(testOperationLogDbName),
    });

    mergedKysely = await initMergedDatabase(
      testOperationLogDbName,
      mainDialect,
      operationLogDialect,
      true
    );
  });

  afterEach(async () => {
    if (mergedKysely != null) {
      await mergedKysely.destroy();
    }

    // Clean up test databases
    if (existsSync(testMainDbName)) {
      unlinkSync(testMainDbName);
    }
    if (existsSync(testOperationLogDbName)) {
      unlinkSync(testOperationLogDbName);
    }
  });

  it(`should allow querying both main and operation log tables`, async () => {
    // Test inserting and querying from items table (main database)
    const itemId = crypto.randomUUID();
    await mergedKysely!
      .insertInto(`items`)
      .values({
        id: itemId,
        name: `Test Item`,
        created_at: Date.now(),
        checked: 0,
      })
      .execute();

    const item = await mergedKysely!
      .selectFrom(`items`)
      .selectAll()
      .where(`id`, `=`, itemId)
      .executeTakeFirst();

    expect(item).toBeDefined();
    expect(item?.name).toBe(`Test Item`);

    // Test inserting and querying from op_log.operations table (operation log database)
    const operationId = crypto.randomUUID();
    await mergedKysely!
      .insertInto(`op_log.operations`)
      .values({
        client_created_at: Date.now(),
        id: operationId,
        payload: JSON.stringify({ name: `Test Item` }),
        server_committed_at: null,
        type: `addItem`,
      })
      .execute();

    const operation = await mergedKysely!
      .selectFrom(`op_log.operations`)
      .selectAll()
      .where(`id`, `=`, operationId)
      .executeTakeFirst();

    expect(operation).toBeDefined();
    expect(operation?.type).toBe(`addItem`);
  });

  it(`should support atomic transactions across both databases`, async () => {
    const itemId = crypto.randomUUID();
    const operationId = crypto.randomUUID();

    // Verify both tables are empty initially
    const initialItems = await mergedKysely!
      .selectFrom(`items`)
      .selectAll()
      .execute();
    const initialOperations = await mergedKysely!
      .selectFrom(`op_log.operations`)
      .selectAll()
      .execute();

    try {
      await mergedKysely!.transaction().execute(async (trx) => {
        // Insert into both tables within the transaction
        await trx
          .insertInto(`items`)
          .values({
            id: itemId,
            name: `Transaction Test Item`,
            created_at: Date.now(),
            checked: 0,
          })
          .execute();

        await trx
          .insertInto(`op_log.operations`)
          .values({
            client_created_at: Date.now(),
            id: operationId,
            payload: JSON.stringify({ name: `Transaction Test Item` }),
            server_committed_at: null,
            type: `addItem`,
          })
          .execute();

        // Intentionally throw an error to trigger rollback
        throw new Error(`Test rollback`);
      });
    } catch (error) {
      // Expected to catch the error we threw
      expect((error as Error).message).toBe(`Test rollback`);
    }

    // Verify both insertions were rolled back
    const finalItems = await mergedKysely!
      .selectFrom(`items`)
      .selectAll()
      .execute();
    const finalOperations = await mergedKysely!
      .selectFrom(`op_log.operations`)
      .selectAll()
      .execute();

    expect(finalItems).toHaveLength(initialItems.length);
    expect(finalOperations).toHaveLength(initialOperations.length);

    // Verify the specific items we tried to insert are not present
    const item = await mergedKysely!
      .selectFrom(`items`)
      .selectAll()
      .where(`id`, `=`, itemId)
      .executeTakeFirst();

    const operation = await mergedKysely!
      .selectFrom(`op_log.operations`)
      .selectAll()
      .where(`id`, `=`, operationId)
      .executeTakeFirst();

    expect(item).toBeUndefined();
    expect(operation).toBeUndefined();
  });

  it(`should support successful atomic transactions across both databases`, async () => {
    const itemId = crypto.randomUUID();
    const operationId = crypto.randomUUID();

    // Execute a successful transaction
    await mergedKysely!.transaction().execute(async (trx) => {
      await trx
        .insertInto(`items`)
        .values({
          id: itemId,
          name: `Successful Transaction Item`,
          created_at: Date.now(),
          checked: 0,
        })
        .execute();

      await trx
        .insertInto(`op_log.operations`)
        .values({
          client_created_at: Date.now(),
          id: operationId,
          payload: JSON.stringify({ name: `Successful Transaction Item` }),
          server_committed_at: null,
          type: `addItem`,
        })
        .execute();
    });

    // Verify both insertions were committed
    const item = await mergedKysely!
      .selectFrom(`items`)
      .selectAll()
      .where(`id`, `=`, itemId)
      .executeTakeFirst();

    const operation = await mergedKysely!
      .selectFrom(`op_log.operations`)
      .selectAll()
      .where(`id`, `=`, operationId)
      .executeTakeFirst();

    expect(item).toBeDefined();
    expect(item?.name).toBe(`Successful Transaction Item`);
    expect(operation).toBeDefined();
    expect(operation?.type).toBe(`addItem`);
  });
});
