import { A } from "@solidjs/router";
import type { Component } from "solid-js";
import styles from "./LandingPage.module.css";

/**
 * Landing page for the grocery list application.
 * Currently provides a link to the default list.
 * Will eventually show "Recently Accessed Lists" and "Create New List" functionality.
 */
export const LandingPage: Component = () => (
  <div class={styles[`container`]}>
    <h1>Grocery Lists</h1>
    <div class={styles[`content`]}>
      <p>
        <A href="/list/default-list">Go to default list</A>
      </p>
    </div>
  </div>
);
