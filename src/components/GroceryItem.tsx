import { Component } from "solid-js";
import { GroceryItem as IGroceryItem } from "../types/types";
import styles from "./GroceryItem.module.css";

interface Props {
  item: IGroceryItem;
  onToggle: (id: string, checked: boolean) => void;
}

export const GroceryItem: Component<Props> = (props) => {
  return (
    <div class={styles.container}>
      <input
        type="checkbox"
        checked={props.item.checked}
        onChange={(e) => props.onToggle(props.item.id, e.target.checked)}
      />
      <span class={props.item.checked ? "" : styles.unchecked}>
        {props.item.name}
      </span>
    </div>
  );
};
