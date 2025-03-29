import { Component, createSignal } from "solid-js";
import styles from "./GroceryItem.module.css";
import { Item } from "../types/schemas";

interface Props {
  item: Item;
  onToggle: (id: string, checked: boolean) => void;
  onEdit: (id: string, newName: string) => void;
}

export const GroceryItem: Component<Props> = (props) => {
  const [isEditing, setIsEditing] = createSignal(false);
  const [newName, setNewName] = createSignal(props.item.name);

  const handleEditClick = () => {
    setIsEditing(true);
    setNewName(props.item.name);
  };

  const handleEditSubmit = () => {
    if (newName() !== props.item.name) {
      props.onEdit(props.item.id, newName());
    }
    setIsEditing(false);
  };

  const handleEditCancel = () => {
    setIsEditing(false);
  };

  return (
    <div class={styles.container}>
      <input
        type="checkbox"
        checked={props.item.checked}
        onChange={(e) => props.onToggle(props.item.id, e.target.checked)}
      />
      {isEditing() ? (
        <div class={styles.editContainer}>
          <input
            type="text"
            value={newName()}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={handleEditSubmit}
            onKeyDown={(e) => {
              setNewName(e.currentTarget.value);
              if (e.key === "Enter") handleEditSubmit();
              if (e.key === "Escape") handleEditCancel();
            }}
            ref={(el) => {
              if (el) {
                setTimeout(() => {
                  el.focus();
                }, 1);
              }
            }}
            class={styles.editInput}
          />
          <button onClick={handleEditSubmit} class={styles.editButton}>
            ✓
          </button>
          <button onClick={handleEditCancel} class={styles.editButton}>
            ✕
          </button>
        </div>
      ) : (
        <div class={styles.itemContainer}>
          <span class={props.item.checked ? "" : styles.unchecked}>
            {props.item.name}
          </span>
          <button onClick={handleEditClick} class={styles.editButton}>
            ✎
          </button>
        </div>
      )}
    </div>
  );
};
