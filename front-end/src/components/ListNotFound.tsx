import { useNavigate } from "@solidjs/router";
import type { Component } from "solid-js";
import styles from "./ListNotFound.module.css";

/**
 * Error page displayed when a user attempts to access a list that doesn't exist.
 */
export const ListNotFound: Component = () => {
  const navigate = useNavigate();

  const handleGoHome = () => {
    navigate(`/`);
  };

  return (
    <div class={styles[`container`]}>
      <div class={styles[`content`]}>
        <h1>List Not Found</h1>
        <p class={styles[`message`]}>
          This list doesn&apos;t exist or has been deleted.
        </p>
        <button
          class={styles[`homeButton`]}
          onClick={handleGoHome}
          type="button"
        >
          Go Home
        </button>
      </div>
    </div>
  );
};
