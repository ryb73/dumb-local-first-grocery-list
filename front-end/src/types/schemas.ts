import type { Insertable, Selectable, Updateable } from "kysely";
import type { Items } from "../../db";

// types at all. These types can be useful when typing function arguments.
export type Item = Selectable<Items>;
export type NewItem = Insertable<Items>;
export type ItemUpdate = Updateable<Items>;
