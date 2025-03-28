import { ActiveItem } from "../types/schemas";

export type KyselySchema = {
  active_items: ActiveItem;
  removed_items: {
    name: string;
  };
};
