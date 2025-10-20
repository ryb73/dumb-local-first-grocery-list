import { useNavigate } from "@solidjs/router";
import { type Component, createSignal } from "solid-js";
import { createNewList } from "../registry/create-list.js";
import styles from "./LandingPage.module.css";

/**
 * Landing page for the grocery list application.
 * Allows users to create new lists and access previously created lists.
 */
export const LandingPage: Component = () => {
  const navigate = useNavigate();
  const [isCreating, setIsCreating] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const handleCreateNewList = () => {
    setIsCreating(true);
    setError(null);

    void createNewList()
      .then((listId) => navigate(`/list/${listId}`))
      .catch((err: unknown) => {
        console.error(`Failed to create new list:`, err);
        setError(`Failed to create new list. Please try again.`);
        setIsCreating(false);
      });
  };

  return (
    <div class={styles[`container`]}>
      <h1>Grocery Lists</h1>
      <div class={styles[`content`]}>
        <button
          class={styles[`createButton`]}
          disabled={isCreating()}
          onClick={handleCreateNewList}
          type="button"
        >
          {isCreating() ? `Creating...` : `Create New List`}
        </button>
        {error() != null && <p class={styles[`error`]}>{error()}</p>}
      </div>
    </div>
  );
};
