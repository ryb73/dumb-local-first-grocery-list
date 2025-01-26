
export interface GroceryItem {
  id: string;
  name: string;
  checked: boolean;
  created_at: number;
  last_unchecked_at: number | null;
}

export interface RemovedItem {
  name: string;
  last_removed_at: number;
}
