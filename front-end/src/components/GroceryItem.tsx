import type { Item } from "@grocery-list/shared";
import { defined } from "@ryb73/super-duper-parakeet/lib/src/type-checks";
import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import styles from "./GroceryItem.module.css";

type Props = {
  item: Item;
  onEdit: (id: string, newName: string) => void;
  onToggle: (id: string, checked: boolean) => void;
};

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
    <div class={defined(styles[`container`])}>
      <input
        checked={props.item.checked === 1}
        onChange={(e) => props.onToggle(props.item.id, e.target.checked)}
        type="checkbox"
      />
      {isEditing() ? (
        <div class={defined(styles[`editContainer`])}>
          <input
            class={defined(styles[`editInput`])}
            onBlur={handleEditSubmit}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              setNewName(e.currentTarget.value);
              if (e.key === `Enter`) handleEditSubmit();
              if (e.key === `Escape`) handleEditCancel();
            }}
            ref={(el) => {
              setTimeout(() => {
                el.focus();
              }, 1);
            }}
            type="text"
            value={newName()}
          />
          <button
            class={defined(styles[`editButton`])}
            onClick={handleEditSubmit}
            type="button"
          >
            ✓
          </button>
          <button
            class={defined(styles[`editButton`])}
            onClick={handleEditCancel}
            type="button"
          >
            ✕
          </button>
        </div>
      ) : (
        <div class={defined(styles[`itemContainer`])}>
          <span
            class={props.item.checked === 1 ? defined(styles[`checked`]) : ``}
          >
            {props.item.name}
          </span>
          <button
            class={defined(styles[`editButton`])}
            onClick={handleEditClick}
            type="button"
          >
            ✎
          </button>
        </div>
      )}
    </div>
  );
};
