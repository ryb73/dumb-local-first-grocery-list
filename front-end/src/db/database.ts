import type { Kysely, Transaction } from "kysely";
import type { DB } from "../../db";
import { applyOperation } from "../operation-logging/apply-operation.ts";
import type {
  CreateItemOperation,
  Operation,
  RenameItemOperation,
  SetCheckedStateOperation,
} from "../operation-logging/operation-types.ts";
import type { ItemUpdate } from "../types/schemas";
import type { MergedDB } from "./merged-db";

function narrowTransaction(trx: Transaction<MergedDB>): Transaction<DB> {
  return trx as unknown as Transaction<DB>;
}

export class Database {
  private readonly kysely: Kysely<MergedDB>;
  private readonly isServer: boolean;

  public constructor(kysely: Kysely<MergedDB>, isServer: boolean) {
    this.kysely = kysely;
    this.isServer = isServer;
  }

  /**
   * Gets the underlying Kysely instance for migration compatibility checks.
   * This should only be used by sync logic.
   */
  public getKyselyInstance(): Kysely<MergedDB> {
    return this.kysely;
  }

  /**
   * Logs an operation to the operation log database.
   * This should be called within the same transaction as the main database update.
   */
  private async logOperation(
    trx: Transaction<MergedDB>,
    operation: Omit<Operation, "serverCommittedAt">
  ): Promise<void> {
    await trx
      .insertInto(`op_log.operations`)
      .values({
        client_created_at: operation.clientCreatedAt,
        id: operation.id,
        payload: JSON.stringify(operation.payload),
        server_committed_at: this.isServer ? Date.now() : null,
        type: operation.type,
      })
      .execute();
  }

  public async addItem(name: string) {
    // Use a transaction to ensure atomicity between main DB and operation log
    await this.kysely.transaction().execute(async (trx) => {
      // First try to update an existing item to an unchecked state
      const existingRow = await trx
        .selectFrom(`items`)
        .selectAll()
        .where(`name`, `=`, name)
        .executeTakeFirst();

      if (existingRow != null) {
        // Log SetCheckedStateOperation for unchecking existing item
        const setCheckedOperation: SetCheckedStateOperation = {
          clientCreatedAt: Date.now(),
          id: crypto.randomUUID(),
          payload: {
            itemId: existingRow.id,
            checked: false,
            originalChecked: existingRow.checked === 1,
            originalLastCheckedAt: existingRow.last_checked_at,
          },
          serverCommittedAt: null,
          type: `setCheckedState`,
        };

        await this.logOperation(trx, setCheckedOperation);
        await applyOperation(narrowTransaction(trx), setCheckedOperation);
      } else {
        // Create new item
        const newItemId = crypto.randomUUID();
        const createdAt = Date.now();

        // Log CreateItemOperation for new item
        const createItemOperation: CreateItemOperation = {
          clientCreatedAt: Date.now(),
          id: crypto.randomUUID(),
          payload: {
            item: {
              id: newItemId,
              name,
              createdAt,
            },
          },
          serverCommittedAt: null,
          type: `createItem`,
        };

        await this.logOperation(trx, createItemOperation);
        await applyOperation(narrowTransaction(trx), createItemOperation);
      }
    });
  }

  public async getItems() {
    const dayAgo = Date.now() - 1000 * 60 * 60 * 24;
    return await this.kysely
      .selectFrom(`items`)
      .selectAll()
      .where((eb) =>
        eb(`items.checked`, `=`, 0).or(`items.last_checked_at`, `>`, dayAgo)
      )
      .execute();
  }

  public async getSuggestions() {
    // Get checked items as suggestions
    const results = await this.kysely
      .selectFrom(`items`)
      .select([`name`])
      .where(`checked`, `=`, 1)
      .execute();
    return results.map((result) => result.name);
  }

  public async toggleItem(id: string, checked: boolean): Promise<void> {
    await this.kysely.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom(`items`)
        .selectAll()
        .where(`id`, `=`, id)
        .executeTakeFirst();

      if (item == null) return;

      // Log SetCheckedStateOperation
      const setCheckedOperation: SetCheckedStateOperation = {
        clientCreatedAt: Date.now(),
        id: crypto.randomUUID(),
        payload: checked
          ? {
              checked: true,
              itemId: id,
              newLastCheckedAt: Date.now(),
              originalChecked: item.checked === 1,
              originalLastCheckedAt: item.last_checked_at,
            }
          : {
              itemId: id,
              checked: false,
              originalChecked: item.checked === 1,
              originalLastCheckedAt: item.last_checked_at,
            },
        serverCommittedAt: null,
        type: `setCheckedState`,
      };

      await this.logOperation(trx, setCheckedOperation);
      await applyOperation(narrowTransaction(trx), setCheckedOperation);
    });
  }

  public async updateItem(
    id: string,
    updates: Omit<ItemUpdate, "id">
  ): Promise<void> {
    await this.kysely.transaction().execute(async (trx) => {
      const item = await trx
        .selectFrom(`items`)
        .selectAll()
        .where(`id`, `=`, id)
        .executeTakeFirst();

      if (item == null) return;

      // If the name is being updated, log a RenameItemOperation
      if (updates.name != null && updates.name !== item.name) {
        const renameOperation: RenameItemOperation = {
          clientCreatedAt: Date.now(),
          id: crypto.randomUUID(),
          payload: {
            itemId: id,
            newName: updates.name,
            originalItem: {
              name: item.name,
              checked: item.checked === 1,
              createdAt: item.created_at,
              lastCheckedAt: item.last_checked_at,
            },
          },
          serverCommittedAt: null,
          type: `renameItem`,
        };

        await this.logOperation(trx, renameOperation);
        await applyOperation(narrowTransaction(trx), renameOperation);
      }

      // If checked state is being updated, log a SetCheckedStateOperation
      if (
        updates.checked != null &&
        (updates.checked === 1) !== (item.checked === 1)
      ) {
        const checked = updates.checked === 1;
        const setCheckedOperation: SetCheckedStateOperation = {
          clientCreatedAt: Date.now(),
          id: crypto.randomUUID(),
          payload: checked
            ? {
                checked: true,
                itemId: id,
                newLastCheckedAt: updates.last_checked_at ?? Date.now(),
                originalChecked: item.checked === 1,
                originalLastCheckedAt: item.last_checked_at,
              }
            : {
                itemId: id,
                checked: false,
                originalChecked: item.checked === 1,
                originalLastCheckedAt: item.last_checked_at,
              },
          serverCommittedAt: null,
          type: `setCheckedState`,
        };

        await this.logOperation(trx, setCheckedOperation);
        await applyOperation(narrowTransaction(trx), setCheckedOperation);
      }
    });
  }

  public async getItem(id: string) {
    return await this.kysely
      .selectFrom(`items`)
      .selectAll()
      .where(`id`, `=`, id)
      .executeTakeFirst();
  }
}
