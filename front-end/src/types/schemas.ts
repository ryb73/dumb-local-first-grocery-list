import type { Insertable, Selectable, Updateable } from "kysely";
import type { Items } from "../../db";

export type Item = Selectable<Items>;
// eslint-disable-next-line import/no-unused-modules
export type NewItem = Insertable<Items>;
export type ItemUpdate = Updateable<Items>;
